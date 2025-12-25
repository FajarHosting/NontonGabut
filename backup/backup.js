import { exec } from "child_process";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const out = `./backup/dump-${Date.now()}`;
const cmd = `mongodump --uri="${uri}" --out="${out}"`;

exec(cmd, (err, stdout, stderr) => {
  if (err) {
    console.error("Backup error:", err);
    console.error(stderr);
    process.exit(1);
  }
  console.log("Backup OK:", out);
  console.log(stdout);
});