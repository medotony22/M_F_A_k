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

// دالة شاملة وذكية لجلب المستخدم (سواء بالرد، أو باليوزر @username، أو بالـ ID الرقمي)
async function getTargetUser(ctx) {
    try {
        // 1. لو عامل رد (Reply) على رسالة
        if (ctx.message.reply_to_message) {
            const repliedUser = ctx.message.reply_to_message.from_user;
            if (repliedUser) {
                return { id: repliedUser.id, name: repliedUser.first_name || 'المستخدم' };
            }
        }

        const text = ctx.message.text || '';
        
        // 2. لو كاتب يوزر (يبدأ بـ @)
        const usernameMatch = text.match(/@([a-zA-Z0-9_]+)/);
        if (usernameMatch) {
            const username = usernameMatch[1];
            const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${username}`);
            return { id: chatMember.user.id, name: chatMember.user.first_name || username };
        }

        // 3. لو كاتب آي دي رقمي (أرقام صحيحة في نص الرسالة)
        const parts = text.split(/\s+/);
        for (let part of parts) {
            if (/^\d{5,15}$/.test(part)) {
                const userId = parseInt(part);
                try {
                    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                    return { id: chatMember.user.id, name: chatMember.user.first_name || 'المستخدم' };
                } catch (e) {
                    return { id: userId, name: 'مستخدم' };
                }
            }
        }
    } catch (e) {
        console.error('خطأ في استخراج بيانات العضو:', e);
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

        if (text.includes('الكل')) {
            await ctx.deleteMessage(currentMsgId);
            for (let i = 1; i <= 30; i++) {
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

        if (ctx.message.reply_to_message) {
            await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
            await ctx.deleteMessage(currentMsgId);
            return;
        }

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

// 2. أمر الكتم (بالرد، أو اليوزر، أو الـ ID)
bot.hears(/^(?:\/)?كتم/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص، أو كتابة يوزره (@username)، أو إرفاق الـ ID الخاص به.');
        }

        const chatId = ctx.chat.id;
        if (await isAdmin(ctx, target.id)) {
            return ctx.reply('لا يمكنك كتم مشرف في المجموعة!');
        }

        await ctx.telegram.restrictChatMember(chatId, target.id, {
            permissions: {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            }
        });

        db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [target.id, chatId]);
        await ctx.reply(`تم كتم العضو [${target.name}] بنجاح 🔇`);
    } catch (error) {
        console.error('خطأ في الكتم:', error);
        await ctx.reply('حدث خطأ، تأكد من صحة البيانات وصلاحيات البوت الإدارية.');
    }
});

// 3. أمر فك الكتم / تكلم (بالرد، أو اليوزر، أو الـ ID)
bot.hears(/^(?:\/)?(تكلم|فك الكتم)/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص، أو كتابة يوزره (@username)، أو إرفاق الـ ID الخاص به.');
        }

        const chatId = ctx.chat.id;

        await ctx.telegram.restrictChatMember(chatId, target.id, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            }
        });

        db.run(`DELETE FROM muted_users WHERE user_id = ? AND chat_id = ?`, [target.id, chatId]);
        db.run(`DELETE FROM warnings WHERE user_id = ? AND chat_id = ?`, [target.id, chatId]);
        db.run(`DELETE FROM link_warnings WHERE user_id = ? AND chat_id = ?`, [target.id, chatId]);

        await ctx.reply(`تم إلغاء الكتم عن العضو [${target.name}] 🔊`);
    } catch (error) {
        console.error('خطأ في إلغاء الكتم:', error);
        await ctx.reply('حدث خطأ، تأكد من صحة البيانات وصلاحيات البوت.');
    }
});

// 4. أمر طرد العضو (بالرد، أو اليوزر، أو الـ ID)
bot.hears(/^(?:\/)?طرد/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد طرده، أو كتابة يوزره (@username)، أو إرفاق الـ ID.');
        }

        const chatId = ctx.chat.id;
        if (await isAdmin(ctx, target.id)) {
            return ctx.reply('لا يمكنك طرد مشرف من المجموعة!');
        }

        // طرد العضو من المجموعة
        await ctx.telegram.banChatMember(chatId, target.id);
        // السماح له بالدخول برابط الدعوة لاحقاً (بمعنى طرد فقط وليس حظر نهائي أبدي)
        await ctx.telegram.unbanChatMember(chatId, target.id);

        await ctx.reply(`تم طرد العضو [${target.name}] من المجموعة بنجاح 👢`);
    } catch (error) {
        console.error('خطأ في الطرد:', error);
        await ctx.reply('حدث خطأ، تأكد أن البوت يمتلك صلاحية حظر/طرد المستخدمين.');
    }
});

// 5. أمر عرض المكتومين
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

// 6. نظام الحماية الشامل (الشتائم + الروابط مع السماح بالصور والفيديوهات)
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

    // أ) فحص الروابط
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
                    await ctx.reply(`🔇 تم كتم العضو [${user.first_name}] تلقائياً لتكرار نشر الروابط (3/3).`);
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
                    db.run(`DELETE FROM warnings WHERE user_id = ? AND chat_id = ?`, [user.id, chatId]);
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
    console.log('بوت الحماية المتكامل يعمل بأعلى كفاءة بكل الأوامر (كتم، فك كتم، طرد، مسح، فلتر الروابط)...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
