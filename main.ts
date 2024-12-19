import { Client, User } from "@mtkruto/mtkruto";
import { getUsername } from "./util.ts";
import env from "./env.ts";

const kv = await Deno.openKv(env.KV_PATH == "" ? undefined : env.KV_PATH);
const client = new Client();

await client.importAuthString(env.AUTH_STRING);

const startTime = Date.now();
let whispersMade = 0;

const SHRUG = "¯\\_(ツ)_/¯";

const DEV = Deno.env.get("DEV") !== undefined;

function nextId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(15))).map((v) =>
    v.toString(16).toUpperCase().padStart(2, "0")
  ).join("");
}

client.on("inlineQuery", async (ctx) => {
  let { query } = ctx.inlineQuery;
  query = query.trim();
  const username = query.split(/\s/).slice(-1)[0].toLowerCase();
  if (!username.startsWith("@")) {
    await ctx.answerInlineQuery([{
      id: crypto.randomUUID(),
      type: "article",
      title: "No Username Provided",
      description: "Write someone\u2019s username at the end of your message.",
      messageContent: { type: "text", text: SHRUG },
    }], { isPersonal: false, cacheTime: DEV ? 0 : 3600 }); // none : 1 hour
    return;
  }

  let wasId = false;
  try {
    const withoutAt = username.slice(1);
    if (
      !/^[0-9]+$/.test(withoutAt) ||
      String(withoutAt) != String(Number(withoutAt)) &&
        Number(withoutAt) >= 1
    ) {
      getUsername(username);
    } else {
      wasId = true;
    }
  } catch {
    await ctx.answerInlineQuery([{
      id: crypto.randomUUID(),
      type: "article",
      title: "Invalid Username",
      description: "The username you provided is invalid.",
      messageContent: { type: "text", text: SHRUG },
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
      messageContent: { type: "text", text: SHRUG },
    }], { isPersonal: false, cacheTime: DEV ? 0 : 3600 });
    return;
  }

  const id = nextId();
  await kv.set(["whispers", id], {
    username,
    whisper,
    date: new Date(),
    from: ctx.inlineQuery.from,
  });
  ++whispersMade;

  const target = wasId ? `user with the ID ${username.slice(1)}` : username;
  await ctx.answerInlineQuery([{
    id: crypto.randomUUID(),
    type: "article",
    title: `Whisper to ${target}`,
    description: whisper,
    messageContent: {
      type: "text",
      text: `Whisper to ${target}`,
    },
    replyMarkup: { inlineKeyboard: [[{ text: "View", callbackData: id }]] },
  }], { isPersonal: true, cacheTime: DEV ? 0 : 3600 });
});

client.on("callbackQuery", async (ctx) => {
  if (!ctx.callbackQuery.inlineMessageId || !ctx.callbackQuery.data) {
    return;
  }
  const { value } = await kv.get<
    { whisper: string; username: string; from?: User }
  >([
    "whispers",
    ctx.callbackQuery.data,
  ]);
  if (value != null) {
    let { whisper, username } = value;
    username = username.toLowerCase().slice(1);
    const id = Number(username.slice(1)) || 0;

    const accesptableUsernames = [
      username,
      value.from?.username,
      ...(value.from?.also ?? []),
    ].filter((v): v is NonNullable<typeof v> => !!v).map((v) =>
      v.toLowerCase()
    );
    const usernameAcceptable = (ctx.from.username &&
      accesptableUsernames.includes(ctx.from.username.toLowerCase())) ||
      ctx.from.also?.map((v) => v.toLowerCase()).some((v) =>
        accesptableUsernames.includes(v)
      ) || ctx.from.id == id;
    const willBeRead = ctx.from.username?.toLowerCase() === username ||
      ctx.from.also?.map((v) => v.toLowerCase()).some((v) => v == username);

    if (!usernameAcceptable) {
      await ctx.answerCallbackQuery({
        text: "This is not for you.",
        alert: true,
      });
    } else {
      await ctx.answerCallbackQuery({ text: whisper, alert: true });
      if (willBeRead) {
        const text = `Whisper to @${username}`;
        await ctx.editInlineMessageText(text, {
          entities: [{ type: "strikethrough", offset: 0, length: text.length }],
        });
      }
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

await client.start();
