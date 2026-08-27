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
bot.telegram.deleteWebhook({ drop_pending_updates: true });

let db = {};

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

function getChatData(chatId) {
  const c = String(chatId);
  if (!db[c]) db[c] = { users: {} };
  return db[c];
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

function getName(user) {
  if (!user) return "العضو";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "العضو";
}

bot.start((ctx) => {
  if (ctx.chat.type === "private") {
    ctx.reply(`🤖 أهلاً بيك يا ${getName(ctx.from)} في بوت الحماية والترحيب.`);
  }
});

// ترحيب العضو الجديد
bot.on("new_chat_members", async (ctx) => {
  for (const member of ctx.message.new_chat_members) {
    const name = getName(member);
    const username = member.username ? `@${member.username}` : "بدون يوزر";
    const now = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
    
    const chatData = getChatData(ctx.chat.id);
    chatData.users[member.id] = { name, username, joinTime: now, count: 0, isMuted: false };

    await ctx.reply(
      `مرحبا بك في جروبنا المتواضع، نورت الجروب، متنساش تشترك في القناة 🌹\n\n` +
      `👤 الاسم: ${name}\n` +
      `🔗 اليوزر: ${username}\n` +
      `📥 تاريخ ووقت الدخول: ${now}\n\n` +
      `📢 رابط قناتنا:\n${CHANNEL_LINK}`
    );
  }
});

// مغادرة العضو
bot.on("left_chat_member", async (ctx) => {
  const member = ctx.message.left_chat_member;
  if (!member) return;

  const chatData = getChatData(ctx.chat.id);
  const uData = chatData.users[member.id] || {};
  const name = uData.name || getName(member);
  const username = uData.username || (member.username ? `@${member.username}` : "بدون يوزر");
  const joinTime = uData.joinTime || "غير محدد";
  const leaveTime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  await ctx.reply(
    `🚪 **مغادرة عضو من الجروب**\n\n` +
    `👤 الاسم: ${name}\n` +
    `🔗 اليوزر: ${username}\n` +
    `📥 وقت وتاريخ الدخول: ${joinTime}\n` +
    `📤 وقت وتاريخ الخروج: ${leaveTime}`
  );
});

// دالة ذكية ومضمونة لجلب العضو المستهدف (سواء بالرد Reply أو باليوزر أو بالآيدي)
async function getTarget(ctx) {
  if (ctx.message.reply_to_message?.from) {
    return ctx.message.reply_to_message.from;
  }
  
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const query = parts[1];
  
  if (!query) return null;

  const chatData = getChatData(ctx.chat.id);

  // لو كاتب آيدي
  if (/^\d+$/.test(query)) {
    const userId = Number(query);
    if (!chatData.users[userId]) {
      chatData.users[userId] = { name: "عضو", username: "بدون", count: 0, isMuted: false };
    }
    return { id: userId, first_name: chatData.users[userId].name, username: chatData.users[userId].username };
  }

  // لو كاتب يوزر @username
  if (query.startsWith("@")) {
    const qClean = query.replace("@", "").toLowerCase();
    for (const uId in chatData.users) {
      if (chatData.users[uId].username?.replace("@", "").toLowerCase() === qClean) {
        return { id: Number(uId), first_name: chatData.users[uId].name, username: chatData.users[uId].username };
      }
    }
    // لو اليوزر مش متسجل في الذاكرة المؤقتة، بنحفظه افتراضياً عشان البوت يقدر يتعامل معاه
    const fakeId = Date.now();
    chatData.users[fakeId] = { name: query, username: query, count: 0, isMuted: false };
    return { id: fakeId, first_name: query, username: query };
  }

  return null;
}

// مراقبة الشتائم والروابط
bot.on("message", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!ctx.message.text) return;

  const text = ctx.message.text.trim();
  const adminCommands = ["كتم", "فك الكتم", "تحذير", "تحذيرات", "مسح التحذيرات", "حذف", "احصائيات", "طرد", "حظر", "فك الحظر", "المكتومين"];
  if (adminCommands.some(cmd => text.startsWith(cmd))) return;

  const user = ctx.from;
  if (!user || (await isAdmin(ctx, user.id))) return;

  const chatData = getChatData(ctx.chat.id);
  if (!chatData.users[user.id]) {
    chatData.users[user.id] = { name: getName(user), username: user.username ? `@${user.username}` : "بدون يوزر", count: 0, isMuted: false };
  }

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

    chatData.users[user.id].count += 1;
    const count = chatData.users[user.id].count;
    const name = chatData.users[user.id].name;
    const username = chatData.users[user.id].username;

    if (count >= 4) {
      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, user.id, {
          permissions: { can_send_messages: false }
        });
        chatData.users[user.id].isMuted = true;
        await ctx.reply(`🚨 **كتم دائم**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ عدد المخالفات: ${count} (تم الكتم النهائي ولن يُفك إلا بواسطة الإدارة).`);
      } catch {}
      return;
    }

    await ctx.reply(`⚠️ **تنبيه حماية**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ التحذيرات: ${count}/3\n🚨 المخالفة الرابعة = كتم دائم!`);
  }
});

// أوامر الإدارة الشاملة والمحدثة
bot.hears(/^تحذير/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو أو اكتب: تحذير @username");
  try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}

  const chatData = getChatData(ctx.chat.id);
  if (!chatData.users[target.id]) {
    chatData.users[target.id] = { name: target.first_name || "عضو", username: target.username || "بدون", count: 0, isMuted: false };
  }
  chatData.users[target.id].count += 1;

  await ctx.reply(`⚠️ تم تحذير العضو ${chatData.users[target.id].name}. الإجمالي: ${chatData.users[target.id].count}/3`);
});

bot.hears(/^تحذيرات/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو أو اكتب: تحذيرات @username");
  
  const count = getChatData(ctx.chat.id).users[target.id]?.count || 0;
  await ctx.reply(`📊 عدد تحذيرات العضو هي: ${count}/3`);
});

bot.hears(/^مسح التحذيرات/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو أو اكتب: مسح التحذيرات @username");
  
  if (getChatData(ctx.chat.id).users[target.id]) {
    getChatData(ctx.chat.id).users[target.id].count = 0;
  }
  await ctx.reply(`♻️ تم مسح التحذيرات عن العضو بنجاح.`);
});

bot.hears(/^كتم/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو أو اكتب: كتم @username");
  
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, { permissions: { can_send_messages: false } });
    const chatData = getChatData(ctx.chat.id);
    if (!chatData.users[target.id]) {
      chatData.users[target.id] = { name: target.first_name || "عضو", username: target.username || "بدون", count: 0 };
    }
    chatData.users[target.id].isMuted = true;
    await ctx.reply(`🔇 تم كتم العضو نهائياً بأمر من الإدارة.`);
  } catch (e) { 
    await ctx.reply(`❌ خطأ في كتم العضو: ${e.message}`); 
  }
});

bot.hears(/^فك الكتم/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو أو اكتب: فك الكتم @username");
  
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, { permissions: { can_send_messages: true } });
    const chatData = getChatData(ctx.chat.id);
    if (chatData.users[target.id]) {
      chatData.users[target.id].isMuted = false;
    }
    await ctx.reply(`🔊 تم فك الكتم عن العضو بنجاح.`);
  } catch (e) { 
    await ctx.reply(`❌ خطأ في فك الكتم: ${e.message}`); 
  }
});

bot.hears(/^طرد/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: طرد @username");
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
    await ctx.reply(`👢 تم طرد العضو من الجروب.`);
  } catch (e) { ctx.reply(`❌ خطأ: ${e.message}`); }
});

bot.hears(/^حظر/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: حظر @username");
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.reply(`⛔ تم حظر العضو نهائياً.`);
  } catch (e) { ctx.reply(`❌ خطأ: ${e.message}`); }
});

bot.hears(/^فك الحظر/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("اكتب: فك الحظر @username (أو آيدي العضو)");
  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
    await ctx.reply(`✅ تم رفع الحظر عن العضو.`);
  } catch (e) { ctx.reply(`❌ خطأ: ${e.message}`); }
});

bot.hears(/^المكتومين$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const users = getChatData(ctx.chat.id).users;
  let list = [];
  for (const id in users) {
    if (users[id].isMuted) {
      list.push(`👤 ${users[id].name} (${users[id].username})`);
    }
  }
  if (list.length === 0) {
    return ctx.reply("📋 لا يوجد أعضاء مكتومين حالياً في هذا الجروب.");
  }
  await ctx.reply(`🔇 **قائمة الأعضاء المكتومين:**\n\n` + list.join("\n"));
});

bot.hears(/^حذف$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  if (!ctx.message.reply_to_message) return ctx.reply("↩️ اعمل Reply على الرسالة المطلوب حذفها واكتب: حذف");
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch {}
});

bot.hears(/^احصائيات$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ للمشرفين فقط.");
  const users = getChatData(ctx.chat.id).users;
  let total = Object.values(users).reduce((s, u) => s + (u.count || 0), 0);
  await ctx.reply(`📊 إجمالي الإنذارات المسجلة: ${total}`);
});

bot.launch();
console.log("✅ Bot started successfully with fixed target function!");
