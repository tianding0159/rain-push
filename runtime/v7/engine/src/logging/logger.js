import fs from "node:fs";
import path from "node:path";

export class NullLogger {
  log() {}
}

export class ArrayLogger {
  entries = [];

  log(entry) {
    this.entries.push(structuredClone(entry));
  }
}

export class JsonlLogger {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
  }

  log(entry) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
