import "std/dotenv/load.ts";
import { cleanEnv, num, str } from "envalid/mod.ts";

export default cleanEnv(Deno.env.toObject(), {
  AUTH_STRING: str(),
  OWNER_ID: num(),
  KV_PATH: str({ default: "" }),
});
