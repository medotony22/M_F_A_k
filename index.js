const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();

// استبدل التوكن الخاص ببوت الحماية هنا
const bot = new Telegraf('8982046146:AAEIRNYA2l5eVt29HNXfnHykB1pPYJdwqOQ');

// إعداد قاعدة البيانات (SQLite) لتخزين المكتومين والتحذيرات
const db = new sqlite3.Database('./protection_bot.db', (err) => {
    if (err) console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة البيانات بنجاح.');
});

// إنشاء الجداول المطلوبة لو مش موجودة
db.run(`CREATE TABLE IF NOT EXISTS warnings (
    user_id TEXT,
    chat_id TEXT,
    count INTEGER,
    PRIMARY KEY (user_id, chat_id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS link_warnings (
    user_id TEXT,
    chat_id TEXT,
    count INTEGER,
    PRIMARY KEY (user_id, chat_id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS muted_users (
    user_id TEXT,
    chat_id TEXT,
    PRIMARY KEY (user_id, chat_id)
)`);

// الكلمات المسيئة المطلوبة بدقة
const badWords = [
    "كسمك",
    "كس",
    "شراميط",
    "شرموط",
    "شرمطه",
    "منيوك",
    "منيكه",
    "متناك",
    "ك.س.م.ك",
    "ابن متناكه",
    "ابن قحبه",
    "قحبه"
];

// دالة للتحقق مما إذا كان المستخدم مشرفاً (Admin) في المجموعة
async function isAdmin(ctx, userId) {
    try {
        if (!userId) return false;
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        const status = chatMember.status;
        return status === 'administrator' || status === 'creator';
    } catch (e) {
        return false;
    }
}

// دالة مساعدة لجلب الـ user_id سواء بالرد (Reply) أو بكتابة اليوزر (مثل @username)
async function getTargetUserId(ctx) {
    if (ctx.message.reply_to_message) {
        return ctx.message.reply_to_message.from_user.id;
    }
    const text = ctx.message.text;
    const match = text.match(/@([a-zA-Z0-9_]+)/);
    if (match) {
        const username = match[1];
        try {
            const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${username}`);
            return chatMember.user.id;
        } catch (e) {
            return null;
        }
    }
    return null;
}

// 1. أمر مسح الرسائل (يدعم مسح عدد معين، أو "مسح الكل"، أو بالرد)
bot.hears(/^(?:\/)?مسح(?:\s+(الكل|(\d+)))?$/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const text = ctx.message.text;
        const chatId = ctx.chat.id;
        const currentMsgId = ctx.message.message_id;

        // إذا طلب مسح الكل
        if (text.includes('الكل')) {
            await ctx.deleteMessage(currentMsgId);
            for (let i = 1; i <= 30; i++) { // مسح آخر 30 رسالة متاحة كدفعة أولى لتنظيف الجروب
                try {
                    await ctx.deleteMessage(currentMsgId - i);
                } catch (e) {}
            }
            const notify = await ctx.reply('تم تنظيف ومسح الرسائل الأخيرة بنجاح 🧹');
            setTimeout(async () => {
                try { await ctx.telegram.deleteMessage(chatId, notify.message_id); } catch(e) {}
            }, 4000);
            return;
        }

        // إذا كان هناك رد على رسالة
        if (ctx.message.reply_to_message) {
            await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
            await ctx.deleteMessage(currentMsgId);
            return;
        }

        // إذا تم كتابة رقم (مثل مسح 5)
        const match = text.match(/\d+/);
        if (match) {
            const count = parseInt(match[0]);
            for (let i = 0; i <= count; i++) {
                try {
                    await ctx.deleteMessage(currentMsgId - i);
                } catch (e) {}
            }
            return;
        }

        await ctx.reply('الاستخدام: رد على رسالة لمسحها، اكتب "مسح [رقم]"، أو "مسح الكل".');
    } catch (error) {
        console.error('خطأ في مسح الرسائل:', error);
    }
});

// 2. أمر الكتم (بالرد أو باليوزر)
bot.hears(/^(?:\/)?كتم/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const targetUserId = await getTargetUserId(ctx);
        if (!targetUserId) {
            return ctx.reply('الرجاء الرد على رسالة الشخص أو كتابة معرفه (مثال: كتم @username).');
        }

        const chatId = ctx.chat.id;
        if (await isAdmin(ctx, targetUserId)) {
            return ctx.reply('لا يمكنك كتم مشرف في المجموعة!');
        }

        const memberInfo = await ctx.telegram.getChatMember(chatId, targetUserId);
        const userName = memberInfo.user.first_name || 'المستخدم';

        await ctx.telegram.restrictChatMember(chatId, targetUserId, {
            permissions: {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            }
        });

        db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [targetUserId, chatId]);
        await ctx.reply(`تم كتم العضو [${userName}] بنجاح 🔇`);
    } catch (error) {
        console.error('خطأ في الكتم:', error);
        await ctx.reply('حدث خطأ، تأكد من صحة اليوزر أو أن البوت يمتلك صلاحيات التقييد.');
    }
});

// 3. أمر فك الكتم / تكلم (بالرد أو باليوزر)
bot.hears(/^(?:\/)?(تكلم|فك الكتم)/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const targetUserId = await getTargetUserId(ctx);
        if (!targetUserId) {
            return ctx.reply('الرجاء الرد على رسالة الشخص أو كتابة معرفه (مثال: تكلم @username).');
        }

        const chatId = ctx.chat.id;
        const memberInfo = await ctx.telegram.getChatMember(chatId, targetUserId);
        const userName = memberInfo.user.first_name || 'المستخدم';

        await ctx.telegram.restrictChatMember(chatId, targetUserId, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            }
        });

        db.run(`DELETE FROM muted_users WHERE user_id = ? AND chat_id = ?`, [targetUserId, chatId]);
        db.run(`DELETE FROM warnings WHERE user_id = ? AND chat_id = ?`, [targetUserId, chatId]);
        db.run(`DELETE FROM link_warnings WHERE user_id = ? AND chat_id = ?`, [targetUserId, chatId]);

        await ctx.reply(`تم إلغاء الكتم عن العضو [${userName}] 🔊`);
    } catch (error) {
        console.error('خطأ في إلغاء الكتم:', error);
    }
});

// 4. أمر عرض المكتومين
bot.hears(/^(?:\/)?المكتومين$/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        db.all(`SELECT user_id FROM muted_users WHERE chat_id = ?`, [chatId], async (err, rows) => {
            if (err || !rows || rows.length === 0) {
                return ctx.reply('لا يوجد أي أعضاء مكتومين حالياً في هذه المجموعة.');
            }

            let listText = 'قائمة الأعضاء المكتومين:\n';
            for (let row of rows) {
                try {
                    const member = await ctx.telegram.getChatMember(chatId, row.user_id);
                    listText += `- ${member.user.first_name} (ID: \`${row.user_id}\`)\n`;
                } catch (e) {
                    listText += `- مستخدم (ID: \`${row.user_id}\`)\n`;
                }
            }
            await ctx.reply(listText, { parse_mode: 'Markdown' });
        });
    } catch (error) {
        console.error('خطأ في عرض المكتومين:', error);
    }
});

// 5. نظام الحماية الشامل (الشتائم + الروابط مع السماح بالصور والفيديوهات)
bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const user = ctx.message.from;
    const chatId = ctx.chat.id;

    if (!user || user.id === 777000 || (user.is_bot && user.username === 'GroupAnonymousBot')) {
        return next();
    }

    if (await isAdmin(ctx, user.id)) {
        return next();
    }

    const text = ctx.message.text || ctx.message.caption || '';
    const lowerText = text.toLowerCase();

    // أ) فحص الروابط (مع السماح بالصور والفيديوهات والملفات العادية)
    const hasLink = /https?:\/\/|www\.|t\.me\/|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(text);

    if (hasLink) {
        try {
            await ctx.deleteMessage();

            db.get(`SELECT count FROM link_warnings WHERE user_id = ? AND chat_id = ?`, [user.id, chatId], async (err, row) => {
                let linkWarns = row ? row.count : 0;
                linkWarns += 1;

                if (linkWarns < 3) {
                    db.run(`INSERT OR REPLACE INTO link_warnings (user_id, chat_id, count) VALUES (?, ?, ?)`, [user.id, chatId, linkWarns]);
                    const msg = await ctx.reply(`⚠️ ممنوع نشر الروابط يا ${user.first_name}!\nإنذار نشر روابط (${linkWarns}/3). الوصول للإنذار الثالث يؤدي للكتم.`);
                    setTimeout(async () => {
                        try { await ctx.telegram.deleteMessage(chatId, msg.message_id); } catch(e) {}
                    }, 5000);
                } else {
                    await ctx.telegram.restrictChatMember(chatId, user.id, {
                        permissions: {
                            can_send_messages: false,
                            can_send_media_messages: false,
                            can_send_other_messages: false,
                            can_add_web_page_previews: false
                        }
                    });
                    db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [user.id, chatId]);
                    db.run(`DELETE FROM link_warnings WHERE user_id = ? AND chat_id = ?`, [user.id, chatId]);
                    await ctx.reply(`🔇 تم كتم العضو [${user.first_name}] تلقائياً لتكرار نشر الروابط (3/3). لن يتم فك الكتم إلا بواسطة المشرفين.`);
                }
            });
            return;
        } catch (error) {
            console.error('خطأ في فحص الروابط:', error);
        }
    }

    // ب) فحص الكلمات المسيئة
    const containsBadWord = badWords.some(word => {
        const regex = new RegExp(`(^|\\s)${word}($|\\s|[.,!؟])`, 'i');
        return regex.test(lowerText) || lowerText.includes(word);
    });

    if (containsBadWord) {
        try {
            await ctx.deleteMessage();

            db.get(`SELECT count FROM warnings WHERE user_id = ? AND chat_id = ?`, [user.id, chatId], async (err, row) => {
                let warningsCount = row ? row.count : 0;
                warningsCount += 1;

                if (warningsCount < 3) {
                    db.run(`INSERT OR REPLACE INTO warnings (user_id, chat_id, count) VALUES (?, ?, ?)`, [user.id, chatId, warningsCount]);
                    const msg = await ctx.reply(`⚠️ تنبيه يا ${user.first_name}! ممنوع استخدام الألفاظ المسيئة.\nالتحذير (${warningsCount}/3). الوصول للثالث يوجب الكتم.`);
                    setTimeout(async () => {
                        try { await ctx.telegram.deleteMessage(chatId, msg.message_id); } catch(e) {}
                    }, 5000);
                } else {
                    await ctx.telegram.restrictChatMember(chatId, user.id, {
                        permissions: {
                            can_send_messages: false,
                            can_send_media_messages: false,
                            can_send_other_messages: false,
                            can_add_web_page_previews: false
                        }
                    });
                    db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [user.id, chatId]);
                    db.run(`DELETE FROM warnings WHERE user_id = ? AND chat_id, = ?`, [user.id, chatId]);
                    await ctx.reply(`🔇 تم كتم العضو [${user.first_name}] تلقائياً لتجاوزه الحد الأقصى من التحذيرات (3/3).`);
                }
            });
            return;
        } catch (error) {
            console.error('خطأ في معالجة الشتائم:', error);
        }
    }

    return next();
});

bot.launch().then(() => {
    console.log('بوت الحماية المتكامل يعمل بأعلى كفاءة الآن...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
