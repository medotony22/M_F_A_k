const { Telegraf } = require("telegraf");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Bot is running successfully!");
});

app.listen(PORT, () => {
  console.log(`🌐 Web server is running on port ${PORT}`);
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_LINK = "https://t.me/faka_m";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const BAD_WORDS = [
  "كسمك",
  "كس",
  "متناك",
  "يامتناك",
  "خخخخخ",
  "انت بتتناك",
  "بيتناك",
  "ينعل كسمك",
  "ينعل دينك",
  "دين امك"
];

// دالة دقيقة جداً للتحقق لو الشخص مالك الجروب أو مشرف
async function isAdminOrOwner(ctx, userId) {
  try {
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return chatMember.status === "creator" || chatMember.status === "administrator";
  } catch {
    return false;
  }
}

function getName(user) {
  if (!user) return "العضو";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "العضو";
}

bot.start((ctx) => {
  try {
    if (ctx.chat.type === "private") {
      ctx.reply(`🤖 أهلاً بيك يا ${getName(ctx.from)} في بوت الحماية والترحيب.`);
    }
  } catch (e) {}
});

// ترحيب العضو الجديد
bot.on("new_chat_members", async (ctx) => {
  try {
    for (const member of ctx.message.new_chat_members) {
      if (member.id === ctx.botInfo.id) continue;
      
      const name = getName(member);
      const username = member.username ? `@${member.username}` : "بدون يوزر";
      const now = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

      await ctx.reply(
        `مرحبا بك في جروبنا المتواضع، نورت الجروب، متنساش تشترك في القناة 🌹\n\n` +
        `👤 الاسم: ${name}\n` +
        `🔗 اليوزر: ${username}\n` +
        `📥 تاريخ ووقت الدخول: ${now}\n\n` +
        `📢 رابط قناتنا:\n${CHANNEL_LINK}`
      );
    }
  } catch (err) {}
});

// مغادرة العضو
bot.on("left_chat_member", async (ctx) => {
  try {
    const member = ctx.message.left_chat_member;
    if (!member || member.id === ctx.botInfo.id) return;

    const name = getName(member);
    const username = member.username ? `@${member.username}` : "بدون يوزر";
    const leaveTime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

    await ctx.reply(
      `🚪 **مغادرة عضو من الجروب**\n\n` +
      `👤 الاسم: ${name}\n` +
      `🔗 اليوزر: ${username}\n` +
      `📤 وقت وتاريخ الخروج: ${leaveTime}`
    );
  } catch (err) {}
});

let warnings = {};

// مراقبة الشتائم والروابط (استثناء تام للمالك والمشرفين)
bot.on("message", async (ctx) => {
  try {
    if (ctx.chat.type === "private") return;
    if (!ctx.message.text) return;

    const user = ctx.from;
    if (!user) return;

    // لو الشخص مالك الجروب أو مشرف، يتم تجاهل رسالته فوراً بدون أي فحص أو إنذار
    if (await isAdminOrOwner(ctx, user.id)) return;

    const text = ctx.message.text.trim();
    const adminCommands = ["كتم", "فك الكتم", "تحذير", "تحذيرات", "مسح التحذيرات", "حذف", "احصائيات", "طرد", "حظر", "فك الحظر", "المكتومين", "مسح"];
    if (adminCommands.some(cmd => text.startsWith(cmd))) return;

    const chatId = ctx.chat.id;
    const userId = user.id;
    const name = getName(user);
    const username = user.username ? `@${user.username}` : "بدون يوزر";

    const linkRegex = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg\/)/i;
    let isViolation = false;
    let reason = "";

    if (linkRegex.test(text)) {
      isViolation = true;
      reason = "نشر رابط ممنوع";
    } else {
      const lower = text.toLowerCase();
      if (BAD_WORDS.some(w => lower.includes(w.toLowerCase()))) {
        isViolation = true;
        reason = "استخدام كلمات مسيئة وممنوعة";
      }
    }

    if (isViolation) {
      try { await ctx.deleteMessage(); } catch {}

      if (!warnings[chatId]) warnings[chatId] = {};
      if (!warnings[chatId][userId]) warnings[chatId][userId] = 0;

      warnings[chatId][userId] += 1;
      const count = warnings[chatId][userId];

      if (count >= 4) {
        try {
          await ctx.telegram.restrictChatMember(chatId, userId, {
            permissions: { can_send_messages: false }
          });
          await ctx.reply(`🚨 **كتم دائم**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ عدد المخالفات: ${count} (تم الكتم النهائي ولن يُفك إلا بواسطة الإدارة).`);
        } catch {}
        return;
      }

      await ctx.reply(`⚠️ **تنبيه حماية**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ التحذيرات: ${count}/3\n🚨 المخالفة الرابعة = كتم دائم!`);
    }
  } catch (err) {}
});

// أوامر الإدارة
bot.hears(/^كتم/i, async (ctx) => {
  if (!(await isAdminOrOwner(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  
  if (ctx.message.reply_to_message?.from) {
    const target = ctx.message.reply_to_message.from;
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, { permissions: { can_send_messages: false } });
      await ctx.reply(`🔇 تم كتم العضو ${getName(target)} نهائياً بأمر الإدارة.`);
    } catch (e) {
      await ctx.reply(`❌ خطأ: تأكد أن البوت مشرف ولديه صلاحية تقييد الأعضاء.`);
    }
  } else {
    return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: كتم");
  }
});

bot.hears(/^فك الكتم/i, async (ctx) => {
  if (!(await isAdminOrOwner(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");

  if (ctx.message.reply_to_message?.from) {
    const target = ctx.message.reply_to_message.from;
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, { 
        permissions: { 
          can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true 
        } 
      });
      await ctx.reply(`🔊 تم فك الكتم عن العضو ${getName(target)} بنجاح.`);
    } catch (e) {
      await ctx.reply(`❌ خطأ: تأكد أن البوت مشرف.`);
    }
  } else {
    return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: فك الكتم");
  }
});

bot.hears(/^حظر/i, async (ctx) => {
  if (!(await isAdminOrOwner(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  if (ctx.message.reply_to_message?.from) {
    const target = ctx.message.reply_to_message.from;
    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.reply(`⛔ تم حظر العضو ${getName(target)} نهائياً.`);
    } catch (e) {
      await ctx.reply(`❌ خطأ: تأكد أن البوت مشرف ولديه صلاحية حظر الأعضاء.`);
    }
  } else {
    return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: حظر");
  }
});

// أوامر الحذف والمسح
bot.hears(/^مسح للجميع$/i, async (ctx) => {
  if (!(await isAdminOrOwner(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  
  const chatId = ctx.chat.id;
  let currentMsgId = ctx.message.message_id;
  let deletedCount = 0;

  try {
    for (let i = 0; i < 40; i++) {
      try {
        await ctx.telegram.deleteMessage(chatId, currentMsgId);
        deletedCount++;
      } catch (e) {}
      currentMsgId--;
    }
    
    const notify = await ctx.reply(`🧹 تم مسح ${deletedCount} رسالة بنجاح.`);
    setTimeout(() => {
      try { ctx.telegram.deleteMessage(chatId, notify.message_id); } catch {}
    }, 3000);
  } catch (e) {
    await ctx.reply("❌ حدث خطأ، تأكد أن البوت يمتلك صلاحية حذف الرسائل.");
  }
});

bot.hears(/^مسح(\s+\d+)?$/i, async (ctx) => {
  if (!(await isAdminOrOwner(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");

  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const chatId = ctx.chat.id;
  const replyMsg = ctx.message.reply_to_message;

  if (parts.length === 1) {
    try {
      if (replyMsg) {
        await ctx.telegram.deleteMessage(chatId, replyMsg.message_id);
      }
      await ctx.telegram.deleteMessage(chatId, ctx.message.message_id);
    } catch (e) {
      await ctx.reply("❌ عذراً، لا أستطيع حذف هذه الرسالة.");
    }
    return;
  }

  const count = parseInt(parts[1]);
  if (isNaN(count) || count < 1) {
    return ctx.reply("⚠️ يرجى كتابة رقم صحيح بعد كلمة مسح (مثال: مسح 5)");
  }

  let currentMsgId = ctx.message.message_id;
  let deleted = 0;

  try {
    for (let i = 0; i <= count; i++) {
      try {
        await ctx.telegram.deleteMessage(chatId, currentMsgId);
        deleted++;
      } catch (e) {}
      currentMsgId--;
    }

    const successMsg = await ctx.reply(`🗑️ تم مسح ${deleted} رسالة بنجاح.`);
    setTimeout(() => {
      try { ctx.telegram.deleteMessage(chatId, successMsg.message_id); } catch {}
    }, 3000);
  } catch (e) {
    await ctx.reply("❌ حدث خطأ، تأكد أن البوت مشرف وله صلاحية حذف الرسائل.");
  }
});

bot.hears(/^المكتومين$/i, async (ctx) => {
  if (!(await isAdminOrOwner(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  await ctx.reply("🔇 **إدارة الكتم:**\nلعرض وفك الكتم عن أي عضو، قم بالرد (Reply) على رسالته واكتب: `فك الكتم`.");
});

async function startBot() {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log("✅ Bot started successfully!");
  } catch (err) {
    console.error("❌ Error starting bot:", err.message);
  }
}

startBot();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
