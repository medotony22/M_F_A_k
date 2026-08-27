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

bot.on("left_chat_member", async (ctx) => {
  try {
    const member = ctx.message.left_chat_member;
    if (!member || member.id === ctx.botInfo.id) return;
    const name = getName(member);
    const username = member.username ? `@${member.username}` : "بدون يوزر";
    const leaveTime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
    await ctx.reply(`🚪 **مغادرة عضو**\n👤 الاسم: ${name} (${username})\n📤 وقت الخروج: ${leaveTime}`);
  } catch (err) {}
});

let warnings = {};

// مراقبة الشتائم والروابط مع استثناء المالك والمشرفين و AnonymousBot تماماً
bot.on("message", async (ctx) => {
  try {
    if (ctx.chat.type === "private") return;
    if (!ctx.message.text) return;

    const user = ctx.from;
    if (!user) return;

    // استثناء البوت المجهول للمشرفين (GroupAnonymousBot) أو المالك
    if (user.is_bot && user.username === "GroupAnonymousBot") return;

    const member = await ctx.telegram.getChatMember(ctx.chat.id, user.id);
    if (member.status === "creator" || member.status === "administrator") return;

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
          await ctx.reply(`🚨 **كتم دائم**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ عدد المخالفات: ${count} (تم الكتم النهائي).`);
        } catch {}
        return;
      }

      await ctx.reply(`⚠️ **تنبيه حماية**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ التحذيرات: ${count}/3`);
    }
  } catch (err) {}
});

// أوامر الإدارة (كتم بالرد)
bot.hears(/^كتم/i, async (ctx) => {
  if (!ctx.message.reply_to_message?.from) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: كتم");
  const target = ctx.message.reply_to_message.from;
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, { permissions: { can_send_messages: false } });
    await ctx.reply(`🔇 تم كتم العضو ${getName(target)} بنجاح.`);
  } catch (e) {
    await ctx.reply(`❌ تأكد أن البوت مشرف وله صلاحية تقييد الأعضاء.`);
  }
});

// فك الكتم بالرد
bot.hears(/^فك الكتم/i, async (ctx) => {
  if (!ctx.message.reply_to_message?.from) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: فك الكتم");
  const target = ctx.message.reply_to_message.from;
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, { 
      permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true } 
    });
    await ctx.reply(`🔊 تم فك الكتم عن العضو ${getName(target)} بنجاح.`);
  } catch (e) {
    await ctx.reply(`❌ تأكد أن البوت مشرف.`);
  }
});

// حظر بالرد
bot.hears(/^حظر/i, async (ctx) => {
  if (!ctx.message.reply_to_message?.from) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: حظر");
  const target = ctx.message.reply_to_message.from;
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.reply(`⛔ تم حظر العضو ${getName(target)} نهائياً.`);
  } catch (e) {
    await ctx.reply(`❌ تأكد أن البوت مشرف وله صلاحية الحظر.`);
  }
});

// أوامر المسح والحذف الدقيقة
bot.hears(/^مسح للجميع$/i, async (ctx) => {
  const chatId = ctx.chat.id;
  let msgId = ctx.message.message_id;
  let count = 0;
  for (let i = 0; i < 30; i++) {
    try {
      await ctx.telegram.deleteMessage(chatId, msgId);
      count++;
    } catch (e) {}
    msgId--;
  }
  const reply = await ctx.reply(`🧹 تم مسح ${count} رسالة.`);
  setTimeout(() => { try { ctx.telegram.deleteMessage(chatId, reply.message_id); } catch(e){} }, 3000);
});

bot.hears(/^مسح(\s+\d+)?$/i, async (ctx) => {
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const chatId = ctx.chat.id;
  const replyMsg = ctx.message.reply_to_message;

  if (parts.length === 1) {
    try {
      if (replyMsg) await ctx.telegram.deleteMessage(chatId, replyMsg.message_id);
      await ctx.telegram.deleteMessage(chatId, ctx.message.message_id);
    } catch (e) {
      await ctx.reply("❌ تأكد أن البوت يمتلك صلاحية حذف الرسائل.");
    }
    return;
  }

  const num = parseInt(parts[1]);
  if (isNaN(num) || num < 1) return;

  let msgId = ctx.message.message_id;
  let deleted = 0;
  for (let i = 0; i <= num; i++) {
    try {
      await ctx.telegram.deleteMessage(chatId, msgId);
      deleted++;
    } catch (e) {}
    msgId--;
  }
  const reply = await ctx.reply(`🗑️ تم مسح ${deleted} رسالة.`);
  setTimeout(() => { try { ctx.telegram.deleteMessage(chatId, reply.message_id); } catch(e){} }, 3000);
});

bot.hears(/^المكتومين$/i, async (ctx) => {
  await ctx.reply("🔇 لعرض أو فك الكتم عن أي عضو، قم بالرد (Reply) على رسالته واكتب: `فك الكتم`.");
});

async function startBot() {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log("✅ Bot running perfectly!");
  } catch (err) {}
}

startBot();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
