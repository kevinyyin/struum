// The Mac's side of the website's queue, called by app.py (needs BLOB_READ_WRITE_TOKEN).
//   node scripts/queue.mjs next                       claim the next song: prints it as JSON, or null
//   node scripts/queue.mjs finish <id> done <video_id>
//   node scripts/queue.mjs finish <id> failed <message>
import {claimNext, finish} from "../api/_queue.js";

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "next") console.log(JSON.stringify(await claimNext()));
else if (cmd === "finish" && args.length === 3) await finish(args[0], args[1], args[2]);
else { console.error("usage: queue.mjs next | finish <id> done|failed <detail>"); process.exit(2); }
