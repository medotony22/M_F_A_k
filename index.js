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
const LOG_CHAT_ID = process.env.LOG_CHAT_ID;
const CHANNEL_LINK = process.env.CHANNEL_LINK || "ضع رابط القناة هنا";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN غير موجود في متغيرات البيئة");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
bot.telegram.deleteWebhook({ drop_pending_updates: true });
const WARN_FILE = "./warnings.json";

const BAD_WORDS = [
  "كلمة1",
  "كلمة2",
  "كلمة3"
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
  return warnings[chatKey(chatId)]?.[userKey(userId)] || 0;
}

function setWarnings(chatId, userId, count) {
  const c = chatKey(chatId);
  const u = userKey(userId);
  if (!warnings[c]) warnings[c] = {};
  warnings[c][u] = count;
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

async function logEvent(ctx, text) {
  if (!LOG_CHAT_ID) return;
  try {
    await ctx.telegram.sendMessage(LOG_CHAT_ID, text);
  } catch (error) {
    console.error("❌ Log Error:", error.message);
  }
}

bot.on("new_chat_members", async (ctx) => {
  for (const member of ctx.message.new_chat_members) {
    const name = getName(member);
    const groupName = ctx.chat.title || "جروبنا";

    const message =
      `👋 أهلا بيك في جروبنا المتواضع ❤️\n\n` +
      `🌹 نورت الجروب يا ${name}\n\n` +
      `🏠 الجروب: ${groupName}\n\n` +
      `نتمنى لك وقتًا ممتعًا معنا 🤍\n\n` +
      `📢 تابع قناتنا:\n${CHANNEL_LINK}`;

    await ctx.reply(message);

    await logEvent(
      ctx,
      `👋 عضو جديد\n\n` +
      `👤 الاسم: ${name}\n` +
      `🆔 ID: ${member.id}\n` +
      `🏠 الجروب: ${groupName}`
    );
  }
});

async function addWarning(ctx, user, reason) {
  const chatId = ctx.chat.id;
  const userId = user.id;
  const name = getName(user);

  let count = getWarnings(chatId, userId) + 1;
  setWarnings(chatId, userId, count);

  if (count >= 4) {
    try {
      await ctx.telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false
        }
      });

      await ctx.reply(
        `🔇 تم كتم ${name} كتمًا دائمًا.\n\n` +
        `📌 السبب: ${reason}\n` +
        `⚠️ عدد المخالفات: ${count}\n\n` +
        `🔓 لا يمكن فك الكتم إلا بواسطة الإدارة.`
      );

      await logEvent(
        ctx,
        `🔇 كتم دائم\n\n` +
        `👤 العضو: ${name}\n` +
        `🆔 ID: ${userId}\n` +
        `📌 السبب: ${reason}\n` +
        `⚠️ المخالفات: ${count}\n` +
        `🏠 الجروب: ${ctx.chat.title || "غير معروف"}`
      );

      return;
    } catch (error) {
      console.error("❌ Mute Error:", error.message);
    }
  }

  await ctx.reply(
    `⚠️ تحذير للعضو ${name}\n\n` +
    `📌 السبب: ${reason}\n` +
    `⚠️ عدد التحذيرات: ${count}/3\n\n` +
    `🚨 المخالفة الرابعة = كتم دائم`
  );

  await logEvent(
    ctx,
    `⚠️ تحذير\n\n` +
    `👤 العضو: ${name}\n` +
    `🆔 ID: ${userId}\n` +
    `📌 السبب: ${reason}\n` +
    `⚠️ التحذيرات: ${count}/3\n` +
    `🏠 الجروب: ${ctx.chat.title || "غير معروف"}`
  );
}

bot.on("message", async (ctx) => {
  if (!ctx.message.text) return;

  const text = ctx.message.text.trim();

  const adminCommands = [
    "كتم", "فك الكتم", "تحذير", "تحذيرات",
    "مسح التحذيرات", "حظر", "فك الحظر",
    "طرد", "حذف", "حماية", "ايقاف الحماية", "احصائيات"
  ];

  if (adminCommands.some(cmd => text.startsWith(cmd))) return;

  const user = ctx.from;
  if (!user || (await isAdmin(ctx, user.id))) return;

  const linkRegex = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg\/)/i;
  if (linkRegex.test(text)) {
    try { await ctx.deleteMessage(); } catch {}
    await addWarning(ctx, user, "نشر رابط");
    return;
  }

  const lowerText = text.toLowerCase();
  const badWord = BAD_WORDS.find(word => lowerText.includes(word.toLowerCase()));

  if (badWord) {
    try { await ctx.deleteMessage(); } catch {}
    await addWarning(ctx, user, "استخدام كلمة ممنوعة");
    return;
  }
});

async function getTarget(ctx) {
  if (ctx.message.reply_to_message?.from) {
    return ctx.message.reply_to_message.from;
  }
  const parts = ctx.message.text.trim().split(/\s+/);
  const possibleId = parts[1];

  if (possibleId && /^\d+$/.test(possibleId)) {
    return { id: Number(possibleId), first_name: "العضو" };
  }
  return null;
}

bot.hears(/^تحذير(?:\s+(\d+))?$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: تحذير");

  try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch {}
  await addWarning(ctx, target, "تحذير يدوي من الإدارة");
});

bot.hears(/^تحذيرات$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: تحذيرات");

  const count = getWarnings(ctx.chat.id, target.id);
  await ctx.reply(`⚠️ تحذيرات ${getName(target)}: ${count}/3`);
});

bot.hears(/^مسح التحذيرات$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: مسح التحذيرات");

  setWarnings(ctx.chat.id, target.id, 0);
  await ctx.reply(`✅ تم مسح تحذيرات ${getName(target)}.`);
  await logEvent(ctx, `♻️ تم مسح التحذيرات\n\n👤 العضو: ${getName(target)}\n🆔 ID: ${target.id}\n👮 بواسطة: ${getName(ctx.from)}`);
});

bot.hears(/^كتم$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: كتم");

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false
      }
    });
    await ctx.reply(`🔇 تم كتم ${getName(target)} بشكل دائم.`);
    await logEvent(ctx, `🔇 كتم يدوي\n\n👤 العضو: ${getName(target)}\n🆔 ID: ${target.id}\n👮 بواسطة: ${getName(ctx.from)}`);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع كتم العضو.\n\n${error.message}`);
  }
});

bot.hears(/^فك الكتم$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const target = await getTarget(ctx);
  if (!target) return ctx.reply("↩️ اعمل Reply على رسالة العضو واكتب: فك الكتم");

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      }
    });
    await ctx.reply(`🔊 تم فك الكتم عن ${getName(target)}.`);
    await logEvent(ctx, `🔊 فك كتم\n\n👤 العضو: ${getName(target)}\n🆔 ID: ${target.id}\n👮 بواسطة: ${getName(ctx.from)}`);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع فك الكتم.\n\n${error.message}`);
  }
});

bot.hears(/^حذف$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  if (!ctx.message.reply_to_message) return ctx.reply("↩️ اعمل Reply على الرسالة التي تريد حذفها واكتب: حذف");

  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch (error) {
    await ctx.reply(`❌ لم أستطع حذف الرسالة.\n${error.message}`);
  }
});

bot.hears(/^احصائيات$/i, async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) return ctx.reply("❌ الأمر للمشرفين فقط.");
  const groupWarnings = warnings[chatKey(ctx.chat.id)] || {};
  const total = Object.values(groupWarnings).reduce((sum, value) => sum + value, 0);

  await ctx.reply(`📊 إحصائيات الحماية\n\n🏠 الجروب: ${ctx.chat.title || "غير معروف"}\n⚠️ إجمالي التحذيرات المسجلة: ${total}`);
});

bot.start((ctx) => {
  ctx.reply(
    `🤖 أهلاً بيك!\n\n` +
    `أنا بوت الترحيب والحماية الخاص بالجروب ❤️\n\n` +
    `🛡️ أراقب الروابط والكلمات الممنوعة.\n` +
    `⚠️ 3 تحذيرات.\n` +
    `🔇 المخالفة الرابعة = كتم دائم.`
  );
});

bot.catch((err, ctx) => {
  console.error(`❌ خطأ في التعامل مع التحديث ${ctx.updateType}:`, err);
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log("✅ البوت يعمل الآن بنجاح!");
