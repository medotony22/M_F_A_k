const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();

// استبدل التوكن الخاص ببوت الحماية هنا
const bot = new Telegraf('8982046146:AAEIRNYA2l5eVt29HNXfnHykB1pPYJdwqOQ');

// إعداد قاعدة البيانات (SQLite) لتخزين المكتومين والتحذيرات
const db = new sqlite3.Database('./protection_bot.db', (err) => {
    if (err) console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة البيانات بنجاح.');
});

// إنشاء الجدول لو مش موجود
db.run(`CREATE TABLE IF NOT EXISTS warnings (
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
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        return chatMember.status === 'administrator' || chatMember.status === 'creator';
    } catch (e) {
        return false;
    }
}

// 1. أمر مسح الرسائل (يعمل بـ / أو بدون)
bot.hears(/^(?:\/)?مسح(?:\s+(\d+))?$/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        const match = ctx.message.text.match(/^(?:\/)?مسح(?:\s+(\d+))?$/i);
        const count = match && match[1] ? parseInt(match[1]) : null;

        if (ctx.message.reply_to_message) {
            await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
            await ctx.deleteMessage(ctx.message.message_id);
            return;
        }

        if (count) {
            const currentMsgId = ctx.message.message_id;
            for (let i = 0; i < count; i++) {
                try {
                    await ctx.deleteMessage(currentMsgId - i);
                } catch (e) {}
            }
            await ctx.deleteMessage(currentMsgId);
            return;
        }

        await ctx.reply('الرجاء الرد على رسالة لمسحها، أو كتابة عدد الرسائل بجانب الأمر (مثال: مسح 5).');
    } catch (error) {
        console.error('خطأ في مسح الرسائل:', error);
    }
});

// 2. أمر الكتم (يعمل بـ / أو بدون)
bot.hears(/^(?:\/)?كتم$/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد كتمه.');
        }

        const userId = ctx.message.reply_to_message.from_user.id;
        const userName = ctx.message.reply_to_message.from_user.first_name;
        const chatId = ctx.chat.id;

        if (await isAdmin(ctx, userId)) {
            return ctx.reply('لا يمكنك كتم مشرف في المجموعة!');
        }

        await ctx.telegram.restrictChatMember(chatId, userId, {
            permissions: {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            }
        });

        // حفظ في قاعدة البيانات
        db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [userId, chatId]);

        await ctx.reply(`تم كتم العضو [${userName}] بنجاح 🔇`);
    } catch (error) {
        console.error('خطأ في الكتم:', error);
    }
});

// 3. أمر فك الكتم (تكلم) (يعمل بـ / أو بدون)
bot.hears(/^(?:\/)?تكلم$/i, async (ctx) => {
    try {
        if (!await isAdmin(ctx, ctx.message.from.id)) {
            return ctx.reply('هذا الأمر للمشرفين فقط.');
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply('الرجاء الرد على رسالة الشخص المراد إلغاء كتمه.');
        }

        const userId = ctx.message.reply_to_message.from_user.id;
        const userName = ctx.message.reply_to_message.from_user.first_name;
        const chatId = ctx.chat.id;

        await ctx.telegram.restrictChatMember(chatId, userId, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            }
        });

        // إزالة من قائمة المكتومين
        db.run(`DELETE FROM muted_users WHERE user_id = ? AND chat_id = ?`, [userId, chatId]);

        await ctx.reply(`تم إلغاء الكتم عن العضو [${userName}] 🔊`);
    } catch (error) {
        console.error('خطأ في إلغاء الكتم:', error);
    }
});

// 4. أمر عرض المكتومين (يعمل بـ / أو بدون)
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

// 5. نظام الفلتر والتحذيرات التلقائية (مع استثناء المشرفين والقنوات المربوطة)
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const user = ctx.message.from;
    const chatId = ctx.chat.id;

    // استثناء القنوات المربوطة (إذا كان المرسل هو القناة نفسها أو بمعرّف خاص)
    if (!user || user.id === 777000 || user.is_bot && user.username === 'GroupAnonymousBot') {
        return next();
    }

    // استثناء المشرفين
    if (await isAdmin(ctx, user.id)) {
        return next();
    }

    const text = ctx.message.text.toLowerCase();
    
    // التحقق من وجود أي كلمة من القائمة بدقة (سواء في جملة أو لوحدها)
    const containsBadWord = badWords.some(word => {
        // استخدام تعبير منتظم للتأكد من مطابقة الكلمة بشكل صحيح
        const regex = new RegExp(`(^|\\s)${word}($|\\s|[.,!؟])`, 'i');
        return regex.test(text) || text.includes(word);
    });

    if (containsBadWord) {
        try {
            // حذف رسالة الشتيمة فوراً
            await ctx.deleteMessage();

            // جلب عدد التحذيرات الحالية للمستخدم
            db.get(`SELECT count FROM warnings WHERE user_id = ? AND chat_id = ?`, [user.id, chatId], async (err, row) => {
                let warningsCount = row ? row.count : 0;
                warningsCount += 1;

                if (warningsCount < 3) {
                    // تحديث عدد التحذيرات
                    db.run(`INSERT OR REPLACE INTO warnings (user_id, chat_id, count) VALUES (?, ?, ?)`, [user.id, chatId, warningsCount]);
                    
                    const msg = await ctx.reply(`⚠️ تنبيه يا ${user.first_name}! ممنوع استخدام الألفاظ المسيئة.\nالتحذير (${warningsCount}/3). في حال وصولك للتحذير الثالث سيتم كتمك تلقائياً.`);
                    setTimeout(async () => {
                        try { await ctx.telegram.deleteMessage(chatId, msg.message_id); } catch(e) {}
                    }, 5000);
                } else {
                    // الوصل للتحذير الثالث -> كتم دائم
                    await ctx.telegram.restrictChatMember(chatId, user.id, {
                        permissions: {
                            can_send_messages: false,
                            can_send_media_messages: false,
                            can_send_other_messages: false,
                            can_add_web_page_previews: false
                        }
                    });

                    // حفظ في قائمة المكتومين وتصفير التحذيرات أو إبقائها
                    db.run(`INSERT OR REPLACE INTO muted_users (user_id, chat_id) VALUES (?, ?)`, [user.id, chatId]);
                    db.run(`DELETE FROM warnings WHERE user_id = ? AND chat_id = ?`, [user.id, chatId]);

                    await ctx.reply(`🔇 تم كتم العضو [${user.first_name}] تلقائياً لتجاوزه الحد الأقصى من التحذيرات (3/3). ولن يتم فك الكتم إلا يدوياً بواسطة المشرفين.`);
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
    console.log('بوت الحماية يعمل الآن بكل الميزات (بدون شرطة + قاعدة بيانات + تحذيرات الشتائم)...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
