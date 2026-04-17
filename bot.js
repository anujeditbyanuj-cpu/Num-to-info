const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ============== CONFIGURATION ==============
const CONFIG = {
  BOT_TOKEN: "8235223939:AAGEuZEQse4eaTvHPqstvCPYJWtek0ycPCA",
  API_BASE: "https://astha-9vd8.onrender.com/tapi-ed01ffd7362370fdaf13a6a2a41cd433?phone=",
  ADMIN_IDS: [8217006573], // 🔴 APNA TELEGRAM ID YAHAN DALO
  FREE_CREDITS: 7,
  REFER_CREDIT: 1,
  PREMIUM_PRICE: "₹39",
  DB_FILE: "./database.json"
};

const CREDIT = "⚡ 𝑺𝒌 ꭗ 𓆩𝐌.𝐒.𝐃𓆪 & ☠︎𝙑𝙞𝙧𝙖𝙩𓆪";

// ============== DATABASE ==============
class Database {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.DB_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.DB_FILE, 'utf8'));
      }
    } catch (e) {
      console.error("DB Load Error:", e);
    }
    return { users: {}, keys: {}, stats: { totalSearches: 0, todaySearches: 0, lastReset: Date.now() } };
  }

  save() {
    fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(this.data, null, 2));
  }

  getUser(userId) {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        id: userId,
        credits: CONFIG.FREE_CREDITS,
        totalUsed: 0,
        premium: false,
        premiumKey: null,
        referredBy: null,
        referrals: [],
        joinedAt: Date.now(),
        lastSearch: null
      };
      this.save();
    }
    return this.data.users[userId];
  }

  useCredit(userId) {
    const user = this.getUser(userId);
    if (user.premium) return true;
    if (user.credits > 0) {
      user.credits--;
      user.totalUsed++;
      this.save();
      return true;
    }
    return false;
  }

  addCredit(userId, amount) {
    const user = this.getUser(userId);
    user.credits += amount;
    this.save();
  }

  setPremium(userId, key) {
    const user = this.getUser(userId);
    user.premium = true;
    user.premiumKey = key;
    this.save();
  }

  generateKey() {
    const key = 'SKY-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    this.data.keys[key] = { used: false, usedBy: null, createdAt: Date.now() };
    this.save();
    return key;
  }

  validateKey(key, userId) {
    if (this.data.keys[key] && !this.data.keys[key].used) {
      this.data.keys[key].used = true;
      this.data.keys[key].usedBy = userId;
      this.setPremium(userId, key);
      this.save();
      return true;
    }
    return false;
  }

  getStats() {
    return this.data.stats;
  }

  incrementSearch() {
    this.data.stats.totalSearches++;
    this.data.stats.todaySearches++;
    this.save();
  }

  resetDaily() {
    const now = Date.now();
    const lastReset = this.data.stats.lastReset;
    if (now - lastReset > 24 * 60 * 60 * 1000) {
      this.data.stats.todaySearches = 0;
      this.data.stats.lastReset = now;
      this.save();
    }
  }
}

const db = new Database();

// ============== BOT INITIALIZATION ==============
const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });

// ============== UI COMPONENTS ==============
const UI = {
  mainMenu: (credits, isPremium) => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Search Number", callback_data: "search" }],
        [{ text: `💰 My Credits: ${credits}`, callback_data: "credits" }],
        [{ text: "👥 Refer & Earn", callback_data: "refer" }],
        [{ text: "💎 Buy Premium", callback_data: "buy_premium" }],
        [{ text: "📊 My Profile", callback_data: "profile" }],
        [{ text: "❓ Help", callback_data: "help" }]
      ]
    }
  }),

  adminMenu: () => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Statistics", callback_data: "admin_stats" }],
        [{ text: "👥 All Users", callback_data: "admin_users" }],
        [{ text: "🔑 Generate Key", callback_data: "admin_genkey" }],
        [{ text: "📢 Broadcast", callback_data: "admin_broadcast" }],
        [{ text: "🎁 Give Credits", callback_data: "admin_give" }],
        [{ text: "⛔ Ban User", callback_data: "admin_ban" }]
      ]
    }
  }),

  backButton: (to) => ({
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Back", callback_data: to }]]
    }
  })
};

// ============== FORMATTERS ==============
const formatNumber = (num) => {
  if (!num) return "N/A";
  let str = num.toString();
  if (str.length === 10) str = "+91 " + str;
  return str;
};

const formatResult = (info, isPremium) => {
  const premiumBadge = isPremium ? "💎 PREMIUM" : "🆓 FREE";
  
  return `╭━━━━━━━━━━━━━━━━━━━━━╮
┃  💀 NUMBER INFO BOT  ┃
┃     ${premiumBadge}      ┃
╰━━━━━━━━━━━━━━━━━━━━━╯

📱 Number: ${formatNumber(info.mobile || info.phone)}
👤 Name: ${info.name || "N/A"}
👨 Father: ${info.fname || info.fatherName || "N/A"}
🏠 Address: ${info.address || "N/A"}
📍 Circle: ${info.circle || info.location || "N/A"}
📡 Operator: ${info.operator || info.simname || "N/A"}

╭━━━━━━━━━━━━━━━━━━━━━╮
┃  ${CREDIT}  ┃
╰━━━━━━━━━━━━━━━━━━━━━╯`;
};

// ============== COMMANDS ==============

// START COMMAND
bot.onText(/\/start(?:\s+(\d+))?/, (msg, match) => {
  const userId = msg.from.id;
  const user = db.getUser(userId);
  
  // Handle referral
  const referrerId = match[1];
  if (referrerId && referrerId != userId && !user.referredBy && !user.premium) {
    const referrer = db.getUser(referrerId);
    if (referrer) {
      user.referredBy = referrerId;
      referrer.referrals.push(userId);
      db.addCredit(referrerId, CONFIG.REFER_CREDIT);
      bot.sendMessage(referrerId, `🎉 New Referral!\nUser ${msg.from.first_name} joined!\n✅ +${CONFIG.REFER_CREDIT} Credit Added!\n💰 Total Credits: ${referrer.credits + CONFIG.REFER_CREDIT}`);
    }
  }

  const welcomeText = `💀 *WELCOME TO NUMBER INFO BOT* 💀

👤 User: ${msg.from.first_name}
🆔 ID: \`${userId}\`
💰 Credits: ${user.credits} ${user.premium ? "💎 PREMIUM" : ""}

🎯 *Features:*
• 🔍 Number Details Lookup
• 💰 Earn Credits via Referral
• 💎 Premium Access Available

${CREDIT}`;

  bot.sendMessage(msg.chat.id, welcomeText, {
    parse_mode: "Markdown",
    ...UI.mainMenu(user.credits, user.premium)
  });
});

// NUMBER SEARCH COMMAND
bot.onText(/\/num (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const number = match[1].trim().replace(/\D/g, '');

  // Check credits
  if (!db.useCredit(userId)) {
    const user = db.getUser(userId);
    const referLink = `https://t.me/${(await bot.getMe()).username}?start=${userId}`;
    
    return bot.sendMessage(chatId, 
`❌ *NO CREDITS LEFT!*

💰 Your Credits: 0
🔄 Refer friends to earn credits!

🔗 Your Referral Link:
\`${referLink}\`

💎 Or buy Premium for unlimited access!

${CREDIT}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👥 Refer & Earn", callback_data: "refer" }],
          [{ text: "💎 Buy Premium", callback_data: "buy_premium" }]
        ]
      }
    });
  }

  // Show searching message
  const searchingMsg = await bot.sendMessage(chatId, "🔍 *Searching...*", { parse_mode: "Markdown" });

  try {
    const url = CONFIG.API_BASE + number;
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;

    // Delete searching message
    bot.deleteMessage(chatId, searchingMsg.message_id);

    let info;
    // Handle different API response formats
    if (data.phone_details?.result?.results?.[0]) {
      info = data.phone_details.result.results[0];
    } else if (data.result?.[0]) {
      info = data.result[0];
    } else if (data.data) {
      info = data.data;
    } else {
      info = data;
    }

    if (!info || (!info.mobile && !info.phone && !info.name)) {
      return bot.sendMessage(chatId, "❌ *No Data Found for this number!*", {
        parse_mode: "Markdown",
        ...UI.backButton("menu")
      });
    }

    db.incrementSearch();
    const user = db.getUser(userId);

    const resultText = formatResult(info, user.premium) + 
`\n\n💰 Remaining Credits: ${user.premium ? "♾️ Unlimited" : user.credits}`;

    bot.sendMessage(chatId, resultText, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔍 Search Again", callback_data: "search" }],
          [{ text: "🏠 Main Menu", callback_data: "menu" }]
        ]
      }
    });

  } catch (error) {
    bot.deleteMessage(chatId, searchingMsg.message_id);
    console.error("API Error:", error.message);
    bot.sendMessage(chatId, "⚠️ *API Error! Please try again later.*", {
      parse_mode: "Markdown",
      ...UI.backButton("menu")
    });
  }
});

// ADMIN COMMAND
bot.onText(/\/admin/, (msg) => {
  const userId = msg.from.id;
  if (!CONFIG.ADMIN_IDS.includes(userId)) {
    return bot.sendMessage(msg.chat.id, "⛔ *Admin Only!*", { parse_mode: "Markdown" });
  }

  bot.sendMessage(msg.chat.id, 
`🔐 *ADMIN PANEL*

Welcome Boss!
Select an option:`, {
    parse_mode: "Markdown",
    ...UI.adminMenu()
  });
});

// ============== CALLBACK HANDLERS ==============
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  const msgId = query.message.message_id;

  try {
    await bot.answerCallbackQuery(query.id);

    // ADMIN CALLBACKS
    if (data.startsWith("admin_")) {
      if (!CONFIG.ADMIN_IDS.includes(userId)) return;

      switch(data) {
        case "admin_stats":
          const stats = db.getStats();
          const totalUsers = Object.keys(db.data.users).length;
          const premiumUsers = Object.values(db.data.users).filter(u => u.premium).length;
          
          bot.editMessageText(
`📊 *BOT STATISTICS*

👥 Total Users: ${totalUsers}
💎 Premium Users: ${premiumUsers}
🔍 Total Searches: ${stats.totalSearches}
📅 Today Searches: ${stats.todaySearches}
🔑 Total Keys Generated: ${Object.keys(db.data.keys).length}

${CREDIT}`, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "Markdown",
            ...UI.adminMenu()
          });
          break;

        case "admin_genkey":
          const newKey = db.generateKey();
          bot.sendMessage(chatId, 
`🔑 *NEW PREMIUM KEY GENERATED*

\`${newKey}\`

✅ Valid: Yes
⏰ Created: Just now

Share this key with user!`, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[{ text: "🔙 Back to Admin", callback_data: "admin_back" }]]
            }
          });
          break;

        case "admin_users":
          const users = Object.values(db.data.users).slice(-10);
          let userList = "👥 *RECENT USERS*\n\n";
          users.forEach((u, i) => {
            userList += `${i+1}. ID: \`${u.id}\`\n   💰 Credits: ${u.credits}\n   💎 Premium: ${u.premium ? "Yes" : "No"}\n\n`;
          });
          
          bot.editMessageText(userList + CREDIT, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "Markdown",
            ...UI.adminMenu()
          });
          break;

        case "admin_broadcast":
          bot.sendMessage(chatId, "📢 Send the message to broadcast:", {
            reply_markup: { force_reply: true }
          });
          // Store state for next message
          db.data.pendingBroadcast = userId;
          db.save();
          break;

        case "admin_back":
          bot.editMessageText("🔐 *ADMIN PANEL*\n\nSelect an option:", {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "Markdown",
            ...UI.adminMenu()
          });
          break;
      }
      return;
    }

    // USER CALLBACKS
    const user = db.getUser(userId);

    switch(data) {
      case "menu":
        bot.editMessageText(
`💀 *MAIN MENU*

👤 User: ${query.from.first_name}
💰 Credits: ${user.credits} ${user.premium ? "💎" : ""}

Select an option:`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          ...UI.mainMenu(user.credits, user.premium)
        });
        break;

      case "search":
        bot.sendMessage(chatId, 
`🔍 *SEARCH NUMBER*

Send command:
\`/num 9876543210\`

💰 Your Credits: ${user.credits}`, {
          parse_mode: "Markdown"
        });
        break;

      case "credits":
        bot.editMessageText(
`💰 *YOUR CREDITS*

Available: ${user.credits} ${user.premium ? "💎 (UNLIMITED)" : ""}
👥 Referrals: ${user.referrals.length}
🔍 Total Used: ${user.totalUsed}

${user.credits === 0 && !user.premium ? "❌ No credits left!\n👥 Use Refer & Earn" : "✅ Ready to search!"}

${CREDIT}`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          ...UI.backButton("menu")
        });
        break;

      case "refer":
        const botInfo = await bot.getMe();
        const referLink = `https://t.me/${botInfo.username}?start=${userId}`;
        
        bot.editMessageText(
`👥 *REFER & EARN*

🔗 Your Referral Link:
\`${referLink}\`

💰 Per Refer: +${CONFIG.REFER_CREDIT} Credit
👥 Total Referrals: ${user.referrals.length}

📤 Share this link with friends!
When they join, you get ${CONFIG.REFER_CREDIT} credit!

${CREDIT}`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📤 Share Link", url: `https://t.me/share/url?url=${encodeURIComponent(referLink)}&text=Join this awesome Number Info Bot!` }],
              [{ text: "🔙 Back", callback_data: "menu" }]
            ]
          }
        });
        break;

      case "buy_premium":
        bot.editMessageText(
`💎 *BUY PREMIUM*

✨ Premium Benefits:
• ♾️ Unlimited Searches
• ⚡ Priority API Access
• 🚫 No Ads
• 🔒 Private Mode

💰 Price: ${CONFIG.PREMIUM_PRICE}

🗝️ Have a key? Send:
\`/redeem YOUR-KEY-HERE\`

📞 Contact Admin to buy!

${CREDIT}`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          ...UI.backButton("menu")
        });
        break;

      case "profile":
        bot.editMessageText(
`👤 *YOUR PROFILE*

🆔 ID: \`${userId}\`
👤 Name: ${query.from.first_name}
📅 Joined: ${new Date(user.joinedAt).toLocaleDateString()}
💎 Premium: ${user.premium ? "✅ YES" : "❌ NO"}
🔑 Key: ${user.premiumKey || "N/A"}

💰 Credits: ${user.credits}
👥 Referrals: ${user.referrals.length}
🔍 Total Searches: ${user.totalUsed}

${CREDIT}`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          ...UI.backButton("menu")
        });
        break;

      case "help":
        bot.editMessageText(
`❓ *HELP CENTER*

🔍 *Search Number:*
\`/num 9876543210\`

💰 *Check Credits:*
Click "My Credits" button

👥 *Refer & Earn:*
Get your link, share with friends
+${CONFIG.REFER_CREDIT} credit per refer

💎 *Premium:*
Buy key for unlimited access

⚠️ *Note:*
• 10 digit number required
• Indian numbers only
• Data may not be 100% accurate

${CREDIT}`, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          ...UI.backButton("menu")
        });
        break;
    }
  } catch (err) {
    console.error("Callback Error:", err);
  }
});

// REDEEM KEY COMMAND
bot.onText(/\/redeem (.+)/, (msg, match) => {
  const userId = msg.from.id;
  const key = match[1].trim();

  if (db.validateKey(key, userId)) {
    bot.sendMessage(msg.chat.id, 
`🎉 *PREMIUM ACTIVATED!*

✅ Key Redeemed Successfully
💎 You now have UNLIMITED access!

Enjoy premium features!

${CREDIT}`, { parse_mode: "Markdown" });
  } else {
    bot.sendMessage(msg.chat.id, 
`❌ *INVALID KEY!*

This key is either:
• Already used
• Expired
• Incorrect

Contact admin to buy a valid key.

${CREDIT}`, { parse_mode: "Markdown" });
  }
});

// HANDLE BROADCAST
bot.on("message", (msg) => {
  if (db.data.pendingBroadcast && msg.from.id === db.data.pendingBroadcast && msg.text) {
    const adminId = db.data.pendingBroadcast;
    delete db.data.pendingBroadcast;
    db.save();

    let success = 0, failed = 0;
    const users = Object.keys(db.data.users);
    
    users.forEach(userId => {
      bot.sendMessage(userId, `📢 *BROADCAST MESSAGE*\n\n${msg.text}\n\n_${CREDIT}_`, { parse_mode: "Markdown" })
        .then(() => success++)
        .catch(() => failed++);
    });

    bot.sendMessage(adminId, `📢 Broadcast Sent!\n✅ Success: ${success}\n❌ Failed: ${failed}`);
  }
});

// ============== SERVER ==============
app.get("/", (req, res) => {
  db.resetDaily();
  res.json({
    status: "✅ Bot Running",
    users: Object.keys(db.data.users).length,
    searches: db.data.stats.totalSearches,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 Bot Server Running on Port ${PORT}`);
  console.log(`💀 ${CREDIT}`);
});
