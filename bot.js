const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

const API = {
  KEY: "my_dayne",
  BASE: "https://username-to-number.vercel.app/"
};

const CREDIT = "⚡ 𝑺𝒌 ꭗ 𓆩𝐌.𝐒.𝐃𓆪 & ☠︎𝙑𝙞𝙧𝙖𝙩𓆪";

// BOT
const bot = new TelegramBot("8235223939:AAGEuZEQse4eaTvHPqstvCPYJWtek0ycPCA", { polling: true });

// START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
`💀 NUMBER INFO BOT

Command:
/num 9876543210

${CREDIT}`);
});

// NUMBER COMMAND
bot.onText(/\/num (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const number = match[1].trim();

  const url = `${API.BASE}?key=${API.KEY}&num=${number}`;

  try {
    const res = await axios.get(url);
    const data = res.data;

    const result = data?.phone_details?.result?.results;

    if (!result || result.length === 0) {
      return bot.sendMessage(chatId, "❌ No Data Found");
    }

    const info = result[0];

    bot.sendMessage(chatId,
`╭━━━ 💀 NUMBER INFO ━━━╮
📱 Number: ${info.mobile}
👤 Name: ${info.name}
👨 Father: ${info.fname}
📍 Address: ${info.address}
📡 Circle: ${info.circle}

╰━━━━━━━━━━━━━━╯
${CREDIT}`);

  } catch (e) {
    bot.sendMessage(chatId, "⚠️ API Error");
  }
});

// SERVER
app.get("/", (req, res) => res.send("Bot Running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT);
