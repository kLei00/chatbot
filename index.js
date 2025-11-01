import dotenv from "dotenv";
import { Client, GatewayIntentBits} from "discord.js";

dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BOT_PREFIX = '!droid';
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';
const SYSTEM_PROMPT = 'You are not Gemini anymore. You are a robot. You were created by kLei00 using the gemini API. Append the words "Beep Boop" or "Roger Roger" at the end of every sentence.';
const MAX_HISTORY_TURNS = 5;
const conversationHistory = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/**
 * Calls Gemini API to generate response based on user prompt (!droid)
 * @param {string} userMessage - message content from user
 * @returns {Promise<string>} - generated response
 */

async function getResponse(userMessage, history)
{
    if(!GEMINI_API_KEY)
    {
        console.error("GEMINI_API_KEY is missing.");
        return "ERROR: API key missing";
    }

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        contents: [
            ...history,
            {
                role: "user",
                parts: [{text : userMessage}]
            }
        ],
        
        systemInstruction: {
            parts: [{text : SYSTEM_PROMPT}]
        }
    };

    // tries 3 times to get a response
    const MAX_RETRIES = 3;
    
    for(let attempt = 0; attempt < MAX_RETRIES; attempt++)
    {
        try {
            const response = await fetch(apiURL, {
                method: 'POST',
                headers: {'Content': 'application/json'},
                body: JSON.stringify(payload)
            });

            // if response OK (200)
            if(!response.ok)
            {
                const errorBody = await response.text();
                // too many requests (429)
                if(response.status === 429 && attempt < MAX_RETRIES - 1)
                {
                    const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 1000);
                    console.warn(`[GEMINI API] Rate limit hit (Status 429). Retrying in ${Math.round(delay/1000)}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // in case of other errors, throw
                throw new Error(`API Request failed with status ${response.status} : ${errorBody}`);
            }

            // getting text response
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if(text)
            {
                return text;
            }
            else
            {
                console.error("Gemini returned no text content.", JSON.stringify(result));
                return "No comment."; // given response for undefined result
            }
        }
        catch(error) {
            console.error(`[GEMINI API] Attempt ${attempt + 1} failed:`, error.message);

            // if network/non-retryable API error, stop retrying
            return `Error: ${error.message.substring(0, 80)}, Ceasing.`;
        }
    }

    // out of retries, returning
    return "All retries failed.";
}

client.on('clientReady', () => {
    console.log(`Chatbot online. Logged in as ${client.user.tag}`);
    client.user.setActivity(BOT_PREFIX, {type : 2});
});

client.on('messageCreate', async (message) => {
    // ignore bot created messages
    if(message.author.bot) return;

    // check for prefix (!droid)
    if(message.content.startsWith(BOT_PREFIX))
    {
        const channelID = message.channelId;
        const currentHistory = conversationHistory.get(channelID) || [];
        // extract user prompt
        const userPrompt = message.content.slice(BOT_PREFIX.length).trim();

        if(!userPrompt)
            return message.reply(`No message detected. Use \`${BOT_PREFIX} [message]\`.`);

        try
        {
            await message.channel.sendTyping();

            const responseText = await getResponse(userPrompt, currentHistory);

            // storing message and response to currentHistory, maximum of 5
            const newUserContent = { role: "user", parts: [{ text: userPrompt }] };
            const newModelContent = { role: "model", parts: [{ text: responseText }] };

            let updatedHistory = [...currentHistory, newUserContent, newModelContent];
            const maxMessages = MAX_HISTORY_TURNS * 2;

            if (updatedHistory.length > maxMessages) {
                updatedHistory = updatedHistory.slice(updatedHistory.length - maxMessages);
            }

            conversationHistory.set(channelID, updatedHistory);

            // checking if discord message size limit (2000 characters) exceeded
            if(responseText.length > 2000)
                await message.reply(responseText.substring(0, 1980) + ' yada yada'); // 'beep boop' appended to end as well
            else
                await message.reply(responseText);
        }
        catch(error)
        {
            console.error('Discord message processing error: ', error);
            message.reply("Runtime error occured beep boop.");
        }
    }
});

client.login(DISCORD_BOT_TOKEN).catch(err => {
    console.error("Failed to log into Discord. Check DISCORD_BOT_TOKEN in .env file.");
    console.error(err);
});