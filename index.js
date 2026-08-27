const { Telegraf } = require("telegraf");
const fs = require("fs");
const http = require("http");

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.write("🤖 البوت يعمل بنجاح!");
  res.end();
}).listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT}`);
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_LINK = "https://t.me/faka_m"; 

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN غير موجود في متغيرات البيئة");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
bot.telegram.deleteWebhook({ drop_pending_updates: true });
const WARN_FILE = "./warnings.json";

// الكلمات الممنوعة (الشتائم)
const BAD_WORDS = [
  "كسمك",
  "احه",
  "يامتناك"
  "خخخخ"
  "كس"
  "ينلع كسمك"
  "متناك"
  "بتتناك"
];

let warnings = {};

if (fs.existsSync(WARN_FILE)) {
  try {
    warnings = JSON.parse(fs.readFileSync(WARN_FILE, "utf8"));
  } catch {
    warnings = {};
  }
}

function saveWarnings() {
  try {
    fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2));
  } catch (err) {
    console.error("❌ خطأ في حفظ ملف التحذيرات:", err.message);
  }
}

function chatKey(chatId) { return String(chatId); }
function userKey(userId) { return String(userId); }

function getWarnings(chatId, userId) {
  return warnings[chatKey(chatId)]?.[userKey(userId)]?.count || 0;
}

function setWarnings(chatId, userId, count, userData = {}) {
  const c = chatKey(chatId);
  const u = userKey(userId);
  if (!warnings[c]) warnings[c] = {};
  if (!warnings[c][u]) warnings[c][u] = {};
  
  warnings[c][u].count = count;
  warnings[c][u].name = userData.name || warnings[c][u].name || "عضو";
  warnings[c][u].username = userData.username || warnings[c][u].username || "بدون";
  
  if (!warnings[c][u].joinTime) {
    const now = new Date();
    warnings[c][u].joinTime = now.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
  }
  
  saveWarnings();
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
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    "العضو"
  );
}

// الترحيب في الخاص
bot.start((ctx) => {
  if (ctx.chat.type === "private") {
    ctx.reply(
      `🤖 أهلاً بيك يا ${getName(ctx.from)}!\n\n` +
      `أنا البوت المسؤول عن حماية وترحيب المجموعات ❤️\n` +
      `أضفني إلى مجموعتك وامنحني صلاحيات المشرف.`
    );
  }
});

// ترحيب بالعضو الجديد بالصيغة المطلوبة وتاريخ دخوله
bot.on("new_chat_members", async (ctx) => {
  for (const member of ctx.message.new_chat_members) {
    const name = getName(member);
    const username = member.username ? `@${member.username}` : "بدون يوزر";
    
    // تسجيل بيانات الدخول
    const now = new Date();
    const joinTime = now.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
    
    setWarnings(ctx.chat.id, member.id, getWarnings(ctx.chat.id, member.id), {
      name: name,
      username: username,
      joinTime: joinTime
    });

    await ctx.reply(
      `مرحبا بك في جروبنا المتواضع، نورت الجروب، متنساش تشترك في القناة 🌹\n\n` +
      `👤 الاسم: ${name}\n` +
      `🔗 اليوزر: ${username}\n` +
      `📥 تاريخ ووقت الدخول: ${joinTime}\n\n` +
      `📢 رابط قناتنا:\n${https://t.me/faka_m}`
    );
  }
});

// رصد خروج العضو
bot.on("left_chat_member", async (ctx) => {
  const member = ctx.message.left_chat_member;
  if (!member) return;

  const chatId = ctx.chat.id;
  const userId = member.id;
  
  const userData = warnings[chatKey(chatId)]?.[userKey(userId)] || {};
  const name = userData.name || getName(member);
  const username = userData.username || (member.username ? `@${member.username}` : "بدون يوزر");
  const joinTime = userData.joinTime || "غير محدد";
  const leaveTime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  await ctx.reply(
    `🚪 **مغادرة عضو من الجروب**\n\n` +
    `👤 الاسم: ${name}\n` +
    `🔗 اليوزر: ${username}\n` +
    `📥 وقت وتاريخ الدخول: ${joinTime}\n` +
    `📤 وقت وتاريخ الخروج: ${leaveTime}`
  );
});

// دالة جلب العضو المستهدف للأوامر
async function getTarget(ctx) {
  if (ctx.message.reply_to_message?.from) {
    return ctx.message.reply_to_message.from;
  }
  
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const query = parts[1];

  if (!query) return null;

  if (/^\d+$/.test(query)) {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, Number(query));
      return member.user;
    } catch {
      return { id: Number(query), first_name: "العضو" };
    }
  }

  if (query.startsWith("@")) {
    const usernameClean = query.replace("@", "");
    const chatId = ctx.chat.id;
    const groupData = warnings[chatKey(chatId)] || {};
    for (const uId in groupData) {
      if (groupData[uId].username && groupData[uId].username.replace("@", "").toLowerCase() === usernameClean.toLowerCase()) {
        return { id: Number(uId), first_name: groupData[uId].name, username: groupData[uId].username };
      }
    }
    return { first_name: query, username: query };
  }

  return null;
}

// مراقبة الروابط والشتائم
bot.on("message", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!ctx.message.text) return;

  const text = ctx.message.text.trim();

  const adminCommands = [
    "كتم", "فك الكتم", "تحذير", "تحذيرات",
    "مسح التحذيرات", "حذف", "احصائيات", "طرد", "حظر", "فك الحظر", "المكتومين"
  ];
  if (adminCommands.some(cmd => text.startsWith(cmd))) return;

  const user = ctx.from;
  if (!user || (await isAdmin(ctx, user.id))) return;

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
    const lowerText = text.toLowerCase();
    const badWord = BAD_WORDS.find(word => lowerText.includes(word.toLowerCase()));
    if (badWord) {
      isViolation = true;
      reason = "استخدام كلمات غير مناسبة";
    }
  }

  if (isViolation) {
    try { await ctx.deleteMessage(); } catch (e) {}

    let count = getWarnings(chatId, userId) + 1;
    setWarnings(chatId, userId, count, { name, username });

    if (count >= 4) {
      try {
        await ctx.telegram.restrictChatMember(chatId, userId, {
          permissions: {
            can_send_messages: false, can_send_audios: false, can_send_documents: false,
            can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
            can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false,
            can_add_web_page_previews: false
          }
        });
        
        warnings[chatKey(chatId)][userKey(userId)].isMuted = true;
        saveWarnings();

        await ctx.reply(`🚨 **كتم دائم**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ عدد المخالفات: ${count}`);
      } catch (error) {}
      return;
    }

    await ctx.reply(`⚠️ **تنبيه حماية**\n👤 العضو: ${name} (${username})\n📌 السبب: ${reason}\n⚠️ التحذيرات: ${count}/3`);
  }
});

// أوامر الإدارة
bot.hears(/^تحذير/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: تحذير @username");

  try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}
  
  const username = target.username ? `@${target.username}` : "بدون يوزر";
  const name = target.first_name || getName(target);
  let count = getWarnings(ctx.chat.id, target.id) + 1;
  setWarnings(ctx.chat.id, target.id, count, { name, username });

  await ctx.reply(`⚠️ تم تحذير ${name} (${username}). الإجمالي: ${count}/3`);
});

bot.hears(/^تحذيرات/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: تحذيرات @username");

  const count = getWarnings(ctx.chat.id, target.id);
  await ctx.reply(`📊 عدد تحذيرات ${target.first_name || "العضو"} هي: ${count}/3`);
});

bot.hears(/^مسح التحذيرات/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: مسح التحذيرات @username");

  setWarnings(ctx.chat.id, target.id, 0);
  await ctx.reply(`♻️ تم مسح التحذيرات عن العضو.`);
});

bot.hears(/^كتم/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: كتم @username");

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: {
        can_send_messages: false, can_send_audios: false, can_send_documents: false,
        can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
        can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false,
        can_add_web_page_previews: false
      }
    });

    if (warnings[chatKey(ctx.chat.id)]?.[userKey(target.id)]) {
      warnings[chatKey(ctx.chat.id)][userKey(target.id)].isMuted = true;
      saveWarnings();
    }

    await ctx.reply(`🔇 تم كتم العضو بنجاح.`);
  } catch (error) {
    await ctx.reply(`❌ عذراً، لم أستطع كتم العضو: ${error.message}`);
  }
});

bot.hears(/^فك الكتم/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: فك الكتم @username");

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: {
        can_send_messages: true, can_send_audios: true, can_send_documents: true,
        can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
        can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
        can_add_web_page_previews: true
      }
    });

    if (warnings[chatKey(ctx.chat.id)]?.[userKey(target.id)]) {
      warnings[chatKey(ctx.chat.id)][userKey(target.id)].isMuted = false;
      saveWarnings();
    }

    await ctx.reply(`🔊 تم فك الكتم عن العضو.`);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع فك الكتم: ${error.message}`);
  }
});

bot.hears(/^طرد/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: طرد @username");

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
    await ctx.reply(`👢 تم طرد العضو من الجروب.`);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع طرد العضو: ${error.message}`);
  }
});

bot.hears(/^حظر/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply أو اكتب: حظر @username");

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.reply(`⛔ تم حظر العضو نهائياً.`);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع حظر العضو: ${error.message}`);
  }
});

bot.hears(/^فك الحظر/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اكتب: فك الحظر @username");

  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
    await ctx.reply(`✅ تم رفع الحظر عن العضو.`);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع رفع الحظر: ${error.message}`);
  }
});

bot.hears(/^المكتومين$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  
  const chatId = chatKey(ctx.chat.id);
  const groupData = warnings[chatId] || {};
  let mutedList = [];

  for (const uId in groupData) {
    if (groupData[uId].isMuted) {
      mutedList.push(`👤 ${groupData[uId].name} (${groupData[uId].username})`);
    }
  }

  if (mutedList.length === 0) {
    return ctx.reply("📋 لا يوجد أي أعضاء مكتومين حالياً في هذا الجروب.");
  }

  await ctx.reply(`🔇 **قائمة الأعضاء المكتومين:**\n\n` + mutedList.join("\n"));
});

bot.hears(/^حذف$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  if (!ctx.message.reply_to_message) return ctx.reply("↩️ اعمل Reply على الرسالة المطلوب حذفها واكتب: حذف");

  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع حذف الرسالة.`);
  }
});

bot.hears(/^احصائيات$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const groupWarnings = warnings[chatKey(ctx.chat.id)] || {};
  const total = Object.values(groupWarnings).reduce((sum, value) => sum + (value.count || 0), 0);

  await ctx.reply(`📊 **إحصائيات الحماية**\n\n⚠️ إجمالي الإنذارات المسجلة للأعضاء: ${total}`);
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("✅ البوت يعمل بكامل الميزات بنجاح!");
