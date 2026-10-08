// Native messaging host for the Minecraftly Highlighter extension. Chrome/Edge start it
// (through minecraftly-host.bat, which runs this file with Minecraftly.exe in Node mode)
// and talk to it over stdin/stdout: each message is a 4-byte length plus UTF-8 JSON.
// It relays messages to the running Minecraftly app over a named pipe (one JSON per line).
const net = require("node:net");

const pipe = process.argv[2];
let socket = null;
let connected = false;
let pipeBuffer = "";
const queue = [];

function toBrowser(json) {
  const body = Buffer.from(json, "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]));
}

function toApp(json) {
  if (connected) socket.write(`${json}\n`);
  else queue.push(json);
}

function connect() {
  socket = net.connect(pipe);
  socket.setEncoding("utf8");
  socket.on("connect", () => {
    connected = true;
    toBrowser(JSON.stringify({ type: "app-online" }));
    while (queue.length) socket.write(`${queue.shift()}\n`);
  });
  socket.on("data", (chunk) => {
    pipeBuffer += chunk;
    let newline = pipeBuffer.indexOf("\n");
    while (newline !== -1) {
      const line = pipeBuffer.slice(0, newline);
      pipeBuffer = pipeBuffer.slice(newline + 1);
      if (line.trim()) toBrowser(line);
      newline = pipeBuffer.indexOf("\n");
    }
  });
  socket.on("error", () => {});
  socket.on("close", () => {
    if (connected) toBrowser(JSON.stringify({ type: "app-offline" }));
    connected = false;
    queue.length = 0; // requests made while the app is closed are answered by the extension's timeout
    setTimeout(connect, 2000); // Minecraftly not running (yet): keep trying
  });
}

let input = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  while (input.length >= 4) {
    const length = input.readUInt32LE(0);
    if (input.length < 4 + length) break;
    const json = input.subarray(4, 4 + length).toString("utf8");
    input = input.subarray(4 + length);
    toApp(json); // Chrome's JSON never contains raw newlines
  }
});
process.stdin.on("end", () => process.exit(0)); // the browser closed the connection

connect();
