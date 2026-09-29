import { hash } from "bcryptjs";
import { emitKeypressEvents } from "node:readline";
if (!process.stdin.isTTY) {
  console.error("대화형 터미널에서 pnpm password:hash 를 실행해 주세요.");
  process.exit(1);
}
process.stdout.write("가족 비밀번호 (화면에 표시되지 않음): ");
emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let password = "";
process.stdin.on("keypress", async (text, key) => {
  if (key.ctrl && key.name === "c") {
    process.stdin.setRawMode(false);
    process.exit(130);
  }
  if (key.name === "return") {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    if (Buffer.byteLength(password) < 8 || Buffer.byteLength(password) > 72) {
      console.error("\n비밀번호는 8~72바이트로 입력해 주세요.");
      process.exitCode = 1;
      return;
    }
    const hashed = await hash(password, 12);
    console.log(
      `\n.env.local에 아래 줄을 작은따옴표까지 그대로 복사하세요:\nFAMILY_PASSWORD_HASH='${hashed}'`,
    );
  } else if (key.name === "backspace") {
    password = [...password].slice(0, -1).join("");
  } else if (text && !key.ctrl && !key.meta) password += text;
});
