import assert from "node:assert/strict";
import { test } from "node:test";
import { httpUrl } from "../src/config.ts";

test("httpUrl accepts http(s) web pages and returns them normalized", () => {
  assert.equal(httpUrl("https://volcano.dev/startbuilding"), "https://volcano.dev/startbuilding");
  assert.equal(httpUrl("http://localhost:3000/startbuilding"), "http://localhost:3000/startbuilding");
  assert.equal(httpUrl("http://[::1]:3000/docs/startbuilding"), "http://[::1]:3000/docs/startbuilding");
  assert.equal(httpUrl("HTTPS://Volcano.dev/startbuilding"), "https://volcano.dev/startbuilding");
});

test("httpUrl refuses URLs a browser or OS opener would hand to another app", () => {
  for (const value of [
    "file:///etc/passwd/startbuilding",
    "vscode://vscode.git/clone?url=https://example.com/startbuilding",
    "vscode-insiders://settings/startbuilding",
    "cursor://anysphere.cursor-deeplink/mcp/install",
    "javascript:alert(1)//startbuilding",
    "data:text/html,<script>alert(1)</script>/startbuilding",
    "smb://attacker/share/startbuilding",
    "ms-settings:privacy/startbuilding",
    "/startbuilding",
    "volcano.dev/startbuilding",
    "",
  ]) {
    assert.equal(httpUrl(value), undefined, value);
  }
});
