const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();

// استبدل التوكن الخاص ببوت الحماية هنا
const bot = new Telegraf(process.env.BOT_TOKEN || '8982046146:AAEIRNYA2l5eVt29HNXfnHykB1pPYJdwqOQ');

// معلومات المطور والقناة
const DEV_USERNAME = '@mohamedthah';
const CHANNEL_LINK = 'https://t.me/A_F_M_F';

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

db.run(`CREATE TABLE IF NOT EXISTS manual_warnings (
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

// دالة استخراج العضو (بالرد كأولوية قصوى، أو اليوزر، أو الـ ID)
async function getTargetUser(ctx) {
    try {
        if (ctx.message.reply_to_message) {
            const replied = ctx.message.reply_to_message;
            if (replied.from && replied.from.id) {
                return { id: replied.from.id, name: replied.from.first_name || 'المستخدم' };
            }
            if (replied.text) {
                const idMatch = replied.text.match(/\d{5,15}/);
                if (idMatch) {
                    const userId = parseInt(idMatch[0]);
                    try {
                        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                        return { id: member.user.id, name: member.user.first_name || 'المستخدم' };
                    } catch (e) {
                        return { id: userId, name: 'المستخدم' };
                    }
                }
            }
        }

        const text = ctx.message.text || '';
        const usernameMatch = text.match(/@([a-zA-Z0-9_]+)/);
        if (usernameMatch) {
            const username = usernameMatch[1];
            const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${username}`);
            return { id: chatMember.user.id, name: chatMember.user.first_name || username };
        }

        const idMatch = text.match(/\d{5,15}/);
        if (idMatch) {
            const userId = parseInt(idMatch[0]);
            try {
                const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                return { id: member.user.id, name: member.user.first_name || 'المستخدم' };
            } catch (e) {
                return { id: userId, name: 'المستخدم' };
            }
        }
    } catch (e) {
        console.error('خطأ في استخراج بيانات العضو:', e);
    }
    return null;
}

// الرد في الخاص (الدردشة الفردية) بمعلومات المطور والقناة
bot.start((ctx) => {
    if (ctx.chat.type === 'private') {
        ctx.reply(`أهلاً بك في بوت الحماية! 🤖\nإذا كنت بحاجة إلى أي مساعدة، يمكنك التواصل مع مطور البوت: ${DEV_USERNAME}\n\nولا تنسَ الاشتراك في القناة:\n${CHANNEL_LINK}`);
    }
});

bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') {
        try {
            await ctx.reply(`أهلاً بك! أنا بوت حماية المجموعات. إذا كنت بحاجة إلى مساعدة، يمكنك التواصل مع مطور البوت: ${DEV_USERNAME}\n\nولا تنسَ الاشتراك في القناة:\n${CHANNEL_LINK}`);
        } catch (e) {}
        return;
    }
    return next();
});

// 1. أمر مسح الرسائل
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
            for (let i = 1; i <= 150; i++) {
                try {
                    await ctx.deleteMessage(currentMsgId - i);
                } catch (e) {}
            }
            const notify = await ctx.reply('تم تنظيف ومسح الشات الأخير بنجاح 🧹');
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

// 2. أمر الكتم
bot.hears(/^(?:\/)?كتم/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد كتمه.');
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
        await ctx.reply('حدث خطأ، تأكد من صلاحيات البوت الإدارية.');
    }
});

// 3. أمر فك الكتم / تكلم
bot.hears(/^(?:\/)?(تكلم|فك الكتم)/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد إلغاء كتمه.');
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
        db.run(`DELETE FROM manual_warnings WHERE user_id = ? AND chat_id = ?`, [target.id, chatId]);

        await ctx.reply(`تم إلغاء الكتم عن العضو [${target.name}] 🔊`);
    } catch (error) {
        console.error('خطأ في إلغاء الكتم:', error);
        await ctx.reply('حدث خطأ، تأكد من صلاحيات البوت.');
    }
});

// 4. أمر طرد العضو
bot.hears(/^(?:\/)?طرد/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد طرده.');
        }

        const chatId = ctx.chat.id;
        if (await isAdmin(ctx, target.id)) {
            return ctx.reply('لا يمكنك طرد مشرف من المجموعة!');
        }

        await ctx.telegram.banChatMember(chatId, target.id);
        await ctx.telegram.unbanChatMember(chatId, target.id);

        await ctx.reply(`تم طرد العضو [${target.name}] من المجموعة بنجاح 👢`);
    } catch (error) {
        console.error('خطأ في الطرد:', error);
        await ctx.reply('حدث خطأ، تأكد أن البوت يمتلك صلاحية طرد المستخدمين.');
    }
});

// 5. أمر التحذير اليدوي
bot.hears(/^(?:\/)?تحذير/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const target = await getTargetUser(ctx);
        if (!target) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد تحذيره.');
        }

        const chatId = ctx.chat.id;
        if (await isAdmin(ctx, target.id)) {
            return ctx.reply('لا يمكنك تحذير مشرف في المجموعة!');
        }

        db.get(`SELECT count FROM manual_warnings WHERE user_id = ? AND chat_id = ?`, [target.id, chatId], async (err, row) => {
            let count = row ? row.count : 0;
            count += 1;

            if (count === 1) {
                db.run(`INSERT OR REPLACE INTO manual_warnings (user_id, chat_id, count) VALUES (?, ?, ?)`, [target.id, chatId, count]);
                await ctx.reply(`⚠️ تحذير (1/2) موجه إلى العضو [${target.name}]. يرجى الالتزام بقوانين المجموعة.`);
            } else if (count === 2) {
                db.run(`INSERT OR REPLACE INTO manual_warnings (user_id, chat_id, count) VALUES (?, ?, ?)`, [target.id, chatId, count]);
                await ctx.reply(`⚠️ تحذير أخير (2/2) موجه إلى العضو [${target.name}]. الإنذار القادم سيؤدي للكتم التلقائي!`);
            } else {
                await ctx.telegram.restrictChatMember(chatId, target.id, {
                    permissions: {
                        can_send_messages: false,
                        can_send_media_messages: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false
                    }
                });
                db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [target.id, chatId]);
                db.run(`DELETE FROM manual_warnings WHERE user_id = ? AND chat_id = ?`, [target.id, chatId]);
                await ctx.reply(`🔇 تم كتم العضو [${target.name}] لتجاوزه الحد الأقصى من التحذيرات اليدوية.`);
            }
        });
    } catch (error) {
        console.error('خطأ في التحذير اليدوي:', error);
        await ctx.reply('حدث خطأ أثناء تنفيذ التحذير.');
    }
});

// 6. أمر عرض المكتومين
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

// 7. نظام الحماية الشامل التلقائي (الروابط والشتائم)
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
                    const msg = await ctx.reply(`⚠️ ممنوع نشر الروابط يا ${user.first_name}!\nإنذار نشر روابط (${linkWarns}/3).`);
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
                    const msg = await ctx.reply(`⚠️ تنبيه يا ${user.first_name}! ممنوع استخدام الألفاظ المسيئة.\nالتحذير (${warningsCount}/3).`);
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
    console.log('بوت الحماية المتكامل يعمل بأعلى كفاءة الآن...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
