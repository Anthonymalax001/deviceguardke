const readline = require("readline");
const https = require("https");
const http = require("http");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const req = http.request({
      hostname: "localhost",
      port: 5050,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, res => {
      let output = "";
      res.on("data", chunk => output += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(output) });
        } catch {
          resolve({ status: res.statusCode, data: output });
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const email = await ask("DeviceGuardKE login email: ");
    const password = await ask("DeviceGuardKE password: ");

    const login = await request("POST", "/api/auth/login", {
      email: email.trim(),
      password
    });

    if (login.status !== 200 || !login.data.token) {
      console.log("Login failed. HTTP status:", login.status);
      console.log(login.data.message || login.data.error || "Check your login details.");
      return;
    }

    console.log("\nLogin successful. Token kept private.");
    const business = await request(
  "POST",
  "/api/business",
  {
    name: "DeviceGuardKE Test Business",
    business_email: email.trim(),
    business_phone: ""
  },
  login.data.token
);

console.log("\nBusiness-creation test HTTP status:", business.status);
console.log(JSON.stringify(business.data, null, 2));

if (business.status === 201 && business.data.organization) {
  const list = await request("GET", "/api/business", null, login.data.token);

  console.log("\nBusiness-list test HTTP status:", list.status);
  console.log(JSON.stringify(list.data, null, 2));
}
  } catch (error) {
    console.log("Test failed:", error.message);
  } finally {
    rl.close();
  }
})();