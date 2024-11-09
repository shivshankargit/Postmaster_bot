import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import userModel from './models/User.js';
import eventModel from './models/Event.js';
import connectDb  from './config/db.js';
import { GoogleGenerativeAI } from "@google/generative-ai";



const bot = new Telegraf(process.env.BOT_TOKEN);

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });


try{
    connectDb();
    console.log("Database Connected");
} catch(error) {
    console.log(error);
    process.kill(process.pid,"SIGTERM")
}

bot.start(async (ctx) => {
    const from = ctx.update.message.from;

    console.log('from', from)
    
    try {
        const username = from.username ? from.username : `user_${from.id}`;
        await userModel.findOneAndUpdate({ tgId: from.id }, {
            $setOnInsert: {
                firstName: from.first_name,
                lastname: from.last_name,
                isBot: from.is_bot,
                username: username
            },
        },
        { upsert: true, new: true } 
    );

    await ctx.reply(`
        Hey! ${from.first_name}, Welcome. I will be writing highly engaging social media posts for you 🚀 Just keep feeding me with the events through out the day. Let's shine on social media ✨`
    );

    } catch(error) {
        console.log(error);
        await ctx.reply("Facing difficulties!")
    }

});

bot.command('clear', async (ctx) => {
    const from = ctx.update.message.from;

    try {
        await eventModel.deleteMany({ tgId: from.id });
        await ctx.reply(`All your events have been cleared, ${from.first_name}! 🎉`);
    } catch (error) {
        console.error("Error clearing events:", error);
        await ctx.reply("Facing difficulties while clearing your events. Please try again later.");
    }
});

bot.command('generate', async (ctx) => {
    const from = ctx.update.message.from;

    const {message_id: waitMessageId} = await ctx.reply(
        `Hey ${from.first_name}, kindly wait for a moment. Iam curating posts for you 🚀⏳`
    )

    const { message_id:loadingStickermsgId } = await ctx.replyWithSticker(
        'CAACAgQAAxkBAANhZwaF2nb7zumxDTmYwntKuLkj_iMAAgYPAAIevUhRPJsacnU-COg2BA'
    );

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const events = await eventModel.find({
        tgId: from.id,
        createdAt: {
            $gte: startOfDay,
            $lte: endOfDay,
        },
    });

    if (events.length === 0){
        await ctx.deleteMessage(waitMessageId);
        await ctx.deleteMessage(loadingStickermsgId);
        await ctx.reply("No events for the day."); 
        return;
    }

    console.log('events', events);

    try{
        const prompt = `
            Act as a senior copywriter. Write highly engaging posts for Twitter and LinkedIn  using the provided thoughts/events throughout the day.
            Write like a human, for humans. Craft engaging social media posts tailored for LinkedIn and Twitter audiences. Use simple language. 
            Use given time labels just to understand the order of the event; don't mention the time in the posts. Each post should creatively highlight 
            the following events. Ensure the tone is conversational and impactful. Focus on engaging the respective platform's audience, encouraging 
            interaction, and driving interest in the events:
            ${events.map((event) => event.text).join(',')}
        `;

        const result = await model.generateContent(prompt);
        await ctx.deleteMessage(loadingStickermsgId);
        await ctx.deleteMessage(waitMessageId);
        await ctx.reply(result.response.text());
        

    } catch(err) {
        console.log('Facing difficulties')
    }
});

bot.on(message('sticker'),(ctx) => {
    console.log('sticker', ctx.update.message);
})

bot.on(message('text'), async(ctx) => {
    const from = ctx.update.message.from;
    const message = ctx.update.message.text;

    try{
        await eventModel.create({
            text: message,
            tgId: from.id
        });

        await ctx.reply(
            `Noted 👍, keep texting me your thoughts. To generate the posts, just enter the command: /generate`
        );
        await ctx.reply(
            `If you want to clear your previous history, just enter the command: /clear`
        );

        

    } catch(error) {
        console.log(error);
        await ctx.reply("Facing difficulties, please try again later.");
    }
});



bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));