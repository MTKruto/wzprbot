import { Client, StorageLocalStorage, User } from "mtkruto/mod.ts";
import { getUsername } from "mtkruto/client/0_utilities.ts";
import env from "./env.ts";

const kv = await Deno.openKv(env.KV_PATH == "" ? undefined : env.KV_PATH);
const client = new Client(
  new StorageLocalStorage("wzpr"),
  env.API_ID,
  env.API_HASH,
);
const startTime = Date.now();
let whispersMade = 0;

const SHRUG = "¯\\_(ツ)_/¯";

const DEV = Deno.env.get("DEV") !== undefined;

client.on("inlineQuery", async (ctx) => {
  let { query } = ctx.inlineQuery;
  query = query.trim();
  const username = query.split(/\s/).slice(-1)[0];
  if (!username.startsWith("@")) {
    await ctx.answerInlineQuery([{
      id: crypto.randomUUID(),
      type: "article",
      title: "No Username Provided",
      description: "Write someone\u2019s username at the end of your message.",
      inputMessageContent: { messageText: SHRUG },
    }], { isPersonal: false, cacheTime: DEV ? 0 : 3600 }); // none : 1 hour

    return;
  }

  try {
    getUsername(username);
  } catch {
    await ctx.answerInlineQuery([{
      id: crypto.randomUUID(),
      type: "article",
      title: "Invalid Username",
      description: "The username you provided is invalid.",
      inputMessageContent: { messageText: SHRUG },
    }], { isPersonal: false, cacheTime: DEV ? 0 : 3600 });
    return;
  }

  const whisper = query.slice(0, username.length * -1).trim();
  if (whisper.length == 0 || whisper.length > 200) {
    await ctx.answerInlineQuery([{
      id: crypto.randomUUID(),
      type: "article",
      title: "Invalid Whisper Text",
      description: `The whisper text is too ${
        whisper.length == 0 ? "short" : "long"
      }.`,
      inputMessageContent: { messageText: SHRUG },
    }], { isPersonal: false, cacheTime: DEV ? 0 : 3600 });
    return;
  }

  await ctx.answerInlineQuery([{
    id: crypto.randomUUID(),
    type: "article",
    title: `Whisper to ${username.toLowerCase()}`,
    description: whisper,
    inputMessageContent: {
      messageText: `Whisper to ${username.toLowerCase()}`,
    },
    replyMarkup: { inlineKeyboard: [[{ text: "View", callbackData: "view" }]] },
  }], { isPersonal: true, cacheTime: DEV ? 0 : 3600 });
});

client.on("chosenInlineResult", async (ctx) => {
  if (!ctx.chosenInlineResult.inlineMessageId) {
    return;
  }
  const { query, from } = ctx.chosenInlineResult;
  let username = query.split(/\s/).slice(-1)[0];
  const whisper = query.slice(0, username.length * -1).trim();
  username = getUsername(username);
  await kv.set(["whispers", ctx.chosenInlineResult.inlineMessageId], {
    username,
    whisper,
    date: new Date(),
    from,
  });
  whispersMade++;
});

client.on("callbackQuery", async (ctx) => {
  if (!ctx.callbackQuery.inlineMessageId) {
    return;
  }
  const { value } = await kv.get<
    { whisper: string; username: string; from?: User }
  >([
    "whispers",
    ctx.callbackQuery.inlineMessageId,
  ]);
  if (value != null) {
    let { whisper, username } = value;
    username = username.toLowerCase();
    const accesptableUsernames = [
      username,
      value.from?.username,
      ...(value.from?.also ?? []),
    ];
    if (
      (!ctx.from.username ||
        !accesptableUsernames.includes(ctx.from.username)) &&
      !ctx.from.also?.map((v) => v.toLowerCase()).some((v) =>
        accesptableUsernames.includes(v)
      )
    ) {
      await ctx.answerCallbackQuery({
        text: "This is not for you.",
        alert: true,
      });
    } else {
      await ctx.answerCallbackQuery({ text: whisper, alert: true });
    }
  }
});

client.command("stats").filter((ctx) => ctx.chat.id == env.OWNER_ID, (ctx) => {
  const memoryUsed = Math.ceil(Deno.memoryUsage().rss / 1024 / 1024);
  return ctx.reply(
    `Uptime: ${
      (Date.now() - startTime) / 1_000 / 60 / 60
    }h\nMemory used: ${memoryUsed} MB\nWhispers made: ~${whispersMade}`,
  );
});

await client.start(env.BOT_TOKEN);
