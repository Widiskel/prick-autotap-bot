import { account } from "./account.js";
import { Prick } from "./src/prick/prick.js";
import { Helper } from "./utils/helper.js";
import WebSocket from "ws";

var client = new WebSocket("wss://api.prick.lol/ws");

/** @param {Prick} prick */
async function initWss(acc, prick) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Cache-Control": "no-cache",
      Connection: "Upgrade",
      Host: "api.prick.lol",
      Origin: "https://app.prick.lol",
      Pragma: "no-cache",
      "sec-websocket-extensions": "permessage-deflate; client_max_window_bits",
      "sec-websocket-version": "13",
      "sec-websocket-protocol": `${acc}`,
      "user-agent": Helper.randomUserAgent(),
    };

    client = new WebSocket("wss://api.prick.lol/ws", [`${acc}`], headers);

    client.onopen = function () {
      console.log("WebSocket connected");
    };

    client.onmessage = function (event) {
      const [action, data] = Helper.parseData(event);

      if (action == "user") {
        prick.setUser(data);
      }
      resolve();
    };

    client.onclose = function () {
      reject("WebSocket connection closed");
    };

    client.onerror = function (error) {
      reject("WebSocket error:", error);
    };
  });
}

/**
 * @param {Prick} prick
 * @param {Array} tapData
 */
async function tap(tapData, prick) {
  return new Promise((resolve, reject) => {
    console.log();
    console.log(`Tapping for ${tapData.length} Times`);

    client.send(JSON.stringify({ action: "tap", data: tapData }));
    client.once("message", (event) => {
      const [action, data] = Helper.parseData(event);
      if (action == "result-tap") {
        prick.user.energy = data.energy;
        prick.user.balance = data.balance;
        console.log();
        resolve(data.userClicks);
      } else {
        reject(data);
      }
    });
  });
}
/** @param {Prick} prick */
async function regenEnergy(acc, prick) {
  try {
    return new Promise(async (resolve) => {
      console.log();
      console.log(`Regenerate Energy`);
      const res = await fetch(
        "https://api.prick.lol/v1/boost/energy-regeneration",
        {
          headers: {
            accept: "*/*",
            authorization: `Bearer ${acc}`,
            Referer: "https://app.prick.lol/",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          },
          body: null,
          method: "PUT",
        }
      );

      const data = await res.json();
      console.log(data.message);
      if (res.ok) {
        prick.user.energy = data.result.energy;
        prick.user.freeEnergyRegeneration = data.result.freeEnergyRegeneration;

        console.log(`Energy     : ${prick.user.energy}`);
        console.log(`Balance    : ${prick.user.balance}`);
      }
      console.log();
      resolve();
    });
  } catch (error) {
    throw error;
  }
}

/** @param {Prick} prick */
async function activateTurbo(acc, prick) {
  try {
    return new Promise(async (resolve) => {
      console.log();
      console.log(`Activating Turbo`);
      const res = await fetch("https://api.prick.lol/v1/boost/turbo", {
        headers: {
          accept: "*/*",
          authorization: `Bearer ${acc}`,
          Referer: "https://app.prick.lol/",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
        body: null,
        method: "PUT",
      });

      const data = await res.json();
      console.log(data.message);
      if (res.ok) {
        prick.user.freeTurbo = data.result.freeTurbo;
        prick.user.turboEndedAt = Date(data.result.turboEndedAt);
        console.log(`Turbo        : ${prick.user.freeTurbo}`);
        console.log(`Turbo End At : ${prick.user.turboEndedAt}`);
      }
      resolve();
    });
  } catch (error) {
    throw error;
  }
}

/** @param {Prick} prick */
async function operation(acc, prick) {
  console.log(`Account ID   : ${acc}`);
  console.log(`Energy       : ${prick.user.energy}`);
  console.log(`Balance      : ${prick.user.balance}`);
  console.log(`Tap Power    : ${prick.user.clicks}`);
  console.log(`Turbo        : ${prick.user.freeTurbo}`);
  console.log(
    `Turbo Status : ${Date(prick.user.turboEndedAt) >= Date.now()} ${
      prick.user.turboEndedAt
    }`
  );
  console.log(`Regeneration : ${prick.user.freeEnergyRegeneration}`);

  const needRegen =
    prick.user.energy < 50 && prick.user.freeEnergyRegeneration != 0;

  if (needRegen) {
    await regenEnergy(acc, prick);
  }

  const needTurbo =
    prick.user.energy == prick.user.maxEnergy && prick.user.freeTurbo != 0;

  if (needTurbo) {
    await activateTurbo(acc, prick);
  }

  if (
    prick.user.freeTurbo != 0 &&
    prick.user.freeEnergyRegeneration == 0 &&
    prick.user.energy != prick.user.maxEnergy
  ) {
    console.log(
      "You still have turbo, waiting for your energy full and use turbo"
    );
  } else {
    const tapCount = Math.floor(prick.user.energy / 50);
    const tapData = [];

    for (let num = 0; num < tapCount; num++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      tapData.push(Date.now());
    }

    if (tapData.length > 0) {
      await tap(tapData, prick)
        .then(async (count) => {
          console.log(`Successfully tap for ${count} Times`);
          console.log(`Energy     : ${prick.user.energy}`);
          console.log(`Balance    : ${prick.user.balance}`);
          console.log();
        })
        .catch((err) => {
          throw err;
        });
    }
  }

  if (
    prick.user.freeEnergyRegeneration != 0 &&
    prick.user.freeTurbo != 0 &&
    prick.user.energy == prick.user.maxEnergy
  ) {
    console.log(`Turbo        : ${prick.user.freeTurbo}`);
    console.log(`Regeneration : ${prick.user.freeEnergyRegeneration}`);
    console.log("Restarting bot with same account");
    console.log();
    await operation(acc, prick);
  } else {
    client.close();
  }
}

async function startBot(acc) {
  try {
    const prick = new Prick();
    await initWss(acc, prick)
      .then(async () => {
        console.log("======================================");
        console.log(`Starting Bot for account ${acc}`);
        console.log("======================================");
        console.log();
        await operation(acc, prick);
      })
      .catch((err) => {
        throw err;
      });
  } catch (error) {
    throw error;
  }
}
async function delay(ms) {
  console.log("All account processed, sleeping for 10 minutes");
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
(async () => {
  try {
    for (const acc of account) {
      await startBot(acc);
      console.log("======================================");
      console.log(`Account ${acc} complete \nContinue using next account`);
      console.log("======================================");
      console.log();
      console.log();
    }
    await delay(10 * (60 * 1000)).then(() => {
      console.log();
      console.log("Restarting from first account...");
      console.log();
      startBot(account[0]);
    });
  } catch (error) {
    console.log("Error During executing bot", error);
    console.log();
    console.log("Restarting from first account...");
    console.log();
    await startBot(account[0]);
  }
})();
