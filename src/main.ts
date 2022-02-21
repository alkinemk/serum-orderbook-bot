import { Account, Connection, PublicKey } from "@solana/web3.js";
import { Market, Orderbook } from "@project-serum/serum";
import axios from "axios";

let connection = new Connection("https://ssc-dao.genesysgo.net/");
let address = new PublicKey("2L3TXpA5ytXq8jFC7mwmbvvTNkFJM5HRYk2pvXXDgrVR");
let programId = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

// const checkBestBids = (bids: Orderbook, depth: number) => {
//   let topNthBids = bids.getL2(depth);
//   let finalArray = [];
//   for (let i = 1; i < topNthBids.length; i++) {
//     let tmpArray = [];
//     let bidsDifference = Math.abs(topNthBids[i][0] - topNthBids[i - 1][0]);
//     let bidsSize = topNthBids[i][1];
//     tmpArray.push(bidsDifference);
//     tmpArray.push(bidsSize);
//     finalArray.push(tmpArray);
//   }
//   return finalArray;
// };

// const computeBidsDifference = (bids: Orderbook, depth: number) => {
//   let topNthOrders = bids.getL2(depth);

//   for (let i = 0; i < topNthOrders.length - 1; i++) {
//     let currentElement = cleanedArray[i];
//     let nextElement = cleanedArray[i + 1];
//     console.log(currentElement);
//     currentElement.push(currentElement[0] - nextElement[0]);
//   }
// };

const run = async () => {
  const privateKey: string = process.env.PRIVATE_KEY!; // stored as an array string
  const owner = new Account(Uint8Array.from(JSON.parse(privateKey)));
  let baseTokenFree = 0;
  let baseTokenTotal = 0;
  let quoteTokenFree = 0;
  let quoteTokenTotal = 0;
  let previousBaseTokenTotal = 0;
  let previousQuoteTokenTotal = 0;
  console.log("starting bot...");

  while (true) {
    let ready = true;
    let ordersSizeSum = 0;
    let topBidPrice = 0;
    let topBidSize = 0;
    let myOrderPrice = 0;
    let myOrderSize = 0;
    // variables
    let market = await Market.load(connection, address, {}, programId);
    let bids = await market.loadBids(connection);

    //console.log(computeBidsDifference(bids, 5));
    //console.log(checkBestBids(bids, 4));
    //5 * 10^-4
    //0.0005

    //break;

    // Placing orders

    let payer = new PublicKey("2N7odTzkWf7kH7CQy55pLvCCqpnMrjWdoUBeESiroAYL");

    // Retrieving open orders by owner
    let myOrders = await market.loadOrdersForOwner(connection, owner.publicKey);

    // Current orders and asks
    for (let myOrder of myOrders) {
      if (myOrder.side === "buy") {
        myOrderPrice = myOrder.price;
        myOrderSize = myOrder.size;
        ordersSizeSum += myOrderSize;
        console.log(`My order price : ${myOrderPrice} | size : ${myOrderSize}`);
      }
    }

    for (let [price, size] of bids.getL2(1)) {
      topBidPrice = price;
      topBidSize = size;
      console.log(`Top bid price : ${topBidPrice} | size : ${topBidSize}`);
    }

    for (let openOrders of await market.findOpenOrdersAccountsForOwner(
      connection,
      owner.publicKey
    )) {
      baseTokenFree = openOrders.baseTokenFree.toNumber();
      baseTokenTotal = openOrders.baseTokenTotal.toNumber();
      quoteTokenFree = openOrders.quoteTokenFree.toNumber();
      quoteTokenTotal = openOrders.quoteTokenTotal.toNumber();
      // console.log(
      //   baseTokenFree,
      //   baseTokenTotal,
      //   quoteTokenFree,
      //   quoteTokenTotal
      // );
      // console.log(previousBaseTokenTotal, previousQuoteTokenTotal);

      let baseDifference = Math.abs(baseTokenTotal - previousBaseTokenTotal);
      let quoteDifference = Math.abs(quoteTokenTotal - previousQuoteTokenTotal);
      let price = quoteDifference / baseDifference / 1000000;
      if (
        (baseTokenFree !== 0 || quoteTokenFree !== 0) &&
        baseDifference > 0 &&
        previousBaseTokenTotal > 0
      ) {
        postBuyOrderMatchedDiscord(baseDifference, price);
      }

      if (baseTokenFree > 50000 || quoteTokenFree > 50000000) {
        // spl-token accounts to which to send the proceeds from trades
        let baseTokenAccount = new PublicKey(
          "AuPwvJkjQN8Bv91DGg65VQzjz1B3JZhUnNGS4N4DsRHm"
        );
        let quoteTokenAccount = new PublicKey(
          "2N7odTzkWf7kH7CQy55pLvCCqpnMrjWdoUBeESiroAYL"
        );
        try {
          await market.settleFunds(
            connection,
            owner,
            openOrders,
            baseTokenAccount,
            quoteTokenAccount
          );
          console.log("Funds settled...");
        } catch (error) {
          console.log("Settle funds retry...");
        }
      }
    }
    previousBaseTokenTotal = baseTokenTotal;
    previousQuoteTokenTotal = quoteTokenTotal;

    // if (
    //   myOrderID.cmp(previousOrderID) === 0 &&
    //   myOrderSize !== previousOrderSize &&
    //   myOrderSize !== 0
    // ) {
    //   postBuyOrderMatchedDiscord(previousOrderSize - myOrderSize, myOrderPrice);
    // }

    // for (let openOrders of await market.findOpenOrdersAccountsForOwner(
    //   connection,
    //   owner.publicKey
    // )) {
    //   foxy = openOrders.baseTokenFree.toNumber();
    //   if (foxy > 0) {
    //   postBuyOrderMatchedDiscord(foxy - previousFoxy, );
    //   }
    //   if
    // }
    if (
      topBidPrice === myOrderPrice &&
      ordersSizeSum < 5000 &&
      topBidPrice < 0.0065
    ) {
      for (let order of myOrders) {
        if (order.side === "buy") {
          try {
            let signature = await market.cancelOrder(connection, owner, order);
            console.log("Order cancelled, waiting for finalization");
            try {
              while (
                (await (
                  await connection.getSignatureStatus(signature)
                ).value?.confirmationStatus) !== "finalized"
              );
              ready = true;
            } catch (error) {
              console.log(error);
            }
            console.log("Transaction finalized");
          } catch (error) {
            ready = false;
            console.log("Cancel order retry...");
          }
        }
      }
      if (ready === true)
        try {
          let size = Math.round(Math.random() * (20000 - 10000) + 10000);
          let signature = await market.placeOrder(connection, {
            owner,
            payer,
            side: "buy", // 'buy' or 'sell'
            price: myOrderPrice,
            size: size,
            orderType: "limit", // 'limit', 'ioc', 'postOnly'
          });
          console.log("Order placed, waiting for finalization...");
          try {
            while (
              (await (
                await connection.getSignatureStatus(signature)
              ).value?.confirmationStatus) !== "finalized"
            );
          } catch (error) {
            console.log(error);
          }
          console.log("Transaction finalized");
        } catch (error) {
          console.log("Place order retry...");
        }
    }

    // console.log(topBidSize, ordersSizeSum);
    // console.log(topBidPrice, myOrderPrice);
    if (
      (topBidPrice > myOrderPrice || topBidSize > ordersSizeSum) &&
      topBidPrice < 0.008
    ) {
      for (let order of myOrders) {
        if (order.side === "buy") {
          try {
            let signature = await market.cancelOrder(connection, owner, order);
            console.log("Order cancelled, waiting for finalization");
            try {
              while (
                (await (
                  await connection.getSignatureStatus(signature)
                ).value?.confirmationStatus) !== "finalized"
              );
              ready = true;
            } catch (error) {
              console.log(error);
            }
            console.log("Transaction finalized");
          } catch (error) {
            ready = false;
            console.log("Cancel order retry...");
          }
        }
      }
      if (ready === true)
        try {
          let size = Math.round(Math.random() * (20000 - 10000) + 10000);
          //let size = 10;
          let signature = await market.placeOrder(connection, {
            owner,
            payer,
            side: "buy", // 'buy' or 'sell'
            price: topBidPrice + 0.000001,
            size: size,
            orderType: "limit", // 'limit', 'ioc', 'postOnly'
          });
          console.log("Order placed, waiting for finalization...");
          try {
            while (
              (await (
                await connection.getSignatureStatus(signature)
              ).value?.confirmationStatus) !== "finalized"
            );
            ready = false;
          } catch (error) {
            console.log(error);
          }
          console.log("Transaction finalized");
        } catch (error) {
          console.log("Place order retry...");
        }
    }
    await timer(10000);
  }
};
const timer = (ms: any) => new Promise((res) => setTimeout(res, ms));

const postBuyOrderMatchedDiscord = (quantity: Number, price: Number) => {
  axios.post(process.env.FOXY_BOT!, {
    embeds: [
      {
        title: `${quantity} $FOXY succesfully bought at ${price} $USDC`,
      },
    ],
  });
};

const postOrderToDiscord = (size: Number, price: Number, side: string) => {
  axios.post(process.env.FOXY_BOT!, {
    embeds: [
      {
        title: `${side} order succesfully placed`,
        fields: [
          {
            name: "Size",
            value: `${size} $FOXY`,
          },
          {
            name: "Price",
            value: `${price} $USDC`,
          },
        ],
      },
    ],
  });
};

run();
