import { Account, Connection, PublicKey } from "@solana/web3.js";
import { Market, Orderbook } from "@project-serum/serum";
import axios from "axios";

let connection = new Connection(
  "https://wild-holy-firefly.solana-mainnet.quiknode.pro/060daf6c4471e847c1aa05677fa2d50d2302682e/"
);
let address = new PublicKey("2L3TXpA5ytXq8jFC7mwmbvvTNkFJM5HRYk2pvXXDgrVR");
let programId = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
const privateKey: string = process.env.PRIVATE_KEY!; // stored as an array string
const owner = new Account(Uint8Array.from(JSON.parse(privateKey)));

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

const timer = (ms: any) => new Promise((res) => setTimeout(res, ms));

const awaitForTxnFinalization = async (
  signature: string,
  connection: Connection
) => {
  let status: any = "";
  while (status !== "finalized") {
    status = await (
      await connection.getSignatureStatus(signature)
    ).value?.confirmationStatus;
    await timer(15000);
  }
};

const cancelSellOrder = async (
  myOrders: any,
  market: Market,
  sellReady: boolean
) => {
  for (let order of myOrders) {
    if (order.side == "sell") {
      try {
        let signature = await market.cancelOrder(connection, owner, order);
        console.log("Order cancelled, waiting for finalization");
        try {
          await awaitForTxnFinalization(signature, connection);
          sellReady = true;
        } catch (error) {
          console.log(error);
        }
        console.log("Transaction finalized");
      } catch (error) {
        sellReady = false;
        console.log("Retrying to cancel all orders...");
      }
    }
  }
};

const cancelBuyOrder = () => {};

const run = async () => {
  let baseTokenFree = 0;
  let baseTokenTotal = 0;
  let quoteTokenFree = 0;
  let quoteTokenTotal = 0;
  let previousBaseTokenTotal = 0;
  let previousQuoteTokenTotal = 0;
  console.log("starting bot...");

  while (true) {
    let sellReady = true;
    let buyReady = true;

    let topBidPrice = 0;
    let topBidSize = 0;
    let myBuyOrderPrice = 0;
    let myBuyOrderSize = 0;
    let buyOrdersSizeSum = 0;

    let topAskPrice = 0;
    let topAskSize = 0;
    let mySellOrderPrice = 0;
    let mySellOrderSize = 0;
    let sellOrdersSizeSum = 0;

    // variables
    let market = await Market.load(connection, address, {}, programId);
    let bids = await market.loadBids(connection);
    let asks = await market.loadAsks(connection);

    //console.log(computeBidsDifference(bids, 5));
    //console.log(checkBestBids(bids, 4));
    //5 * 10^-4
    //0.0005

    // Placing orders
    let usdcAccount = new PublicKey(
      "2N7odTzkWf7kH7CQy55pLvCCqpnMrjWdoUBeESiroAYL"
    );

    let foxyAccount = new PublicKey(
      "AuPwvJkjQN8Bv91DGg65VQzjz1B3JZhUnNGS4N4DsRHm"
    );

    // Retrieving open orders by owner
    let myOrders = await market.loadOrdersForOwner(connection, owner.publicKey);

    let topAsk = asks.getL2(1)[0];
    topAskPrice = topAsk[0];
    topAskSize = topAsk[1];

    let topBid = bids.getL2(1)[0];
    topBidPrice = topBid[0];
    topBidSize = topBid[1];

    console.log("_________________________");

    console.log(
      `Top bid price : ${topBidPrice} | top ask price : ${topAskPrice}`
    );

    // Current orders and asks
    for (let myOrder of myOrders) {
      if (myOrder.side === "buy") {
        myBuyOrderPrice = myOrder.price;
        myBuyOrderSize = myOrder.size;
        buyOrdersSizeSum += myBuyOrderSize;
        console.log(
          `My buy order price : ${myBuyOrderPrice} | size : ${myBuyOrderSize}`
        );
      }
      if (myOrder.side === "sell") {
        mySellOrderPrice = myOrder.price;
        mySellOrderSize = myOrder.size;
        sellOrdersSizeSum += mySellOrderSize;
        console.log(
          `My sell order price : ${mySellOrderPrice} | size : ${mySellOrderSize}`
        );
      }
    }

    let spread = topAskPrice / topBidPrice - 1;

    if (myBuyOrderPrice !== 0 && mySellOrderPrice !== 0) {
      spread = mySellOrderPrice / myBuyOrderPrice - 1;
    }

    if (spread < 0.2) {
      cancelSellOrder(myOrders, market, sellReady);
    }

    console.log(`Spread : ${spread}`);

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
      //console.log(previousBaseTokenTotal, previousQuoteTokenTotal);
      console.log(
        `To settle : ${quoteTokenFree / 1000000} $USDC | ${baseTokenFree} $FOXY`
      );

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

      // if (
      //   (baseTokenFree !== 0 || quoteTokenFree !== 0) &&
      //   quoteDifference > 0 &&
      //   previousQuoteTokenTotal > 0
      // ) {
      //   postBuyOrderMatchedDiscord(quoteDifference, price);
      // }

      if (baseTokenFree > 50000 || quoteTokenFree > 40000000) {
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

    if (
      topBidPrice === myBuyOrderPrice &&
      buyOrdersSizeSum < 5000 &&
      topBidPrice < 0.006
    ) {
      if (buyReady === true) {
        try {
          let size = Math.round(Math.random() * (25000 - 10000) + 10000);
          let signature = await market.placeOrder(connection, {
            owner,
            payer: usdcAccount,
            side: "buy", // 'buy' or 'sell'
            price: myBuyOrderPrice,
            size: size,
            orderType: "limit", // 'limit', 'ioc', 'postOnly'
          });
          console.log("Buy order placed, waiting for finalization...");
          try {
            await awaitForTxnFinalization(signature, connection);
            buyReady = false;
          } catch (error) {
            console.log(error);
          }
          console.log("Transaction finalized");
        } catch (error) {
          console.log("Retrying to place buy order...");
        }
      }
    }

    // check for triggering a sell order
    if (topAskPrice < mySellOrderPrice || topAskSize > sellOrdersSizeSum) {
      for (let order of myOrders) {
        if (order.side === "sell") {
          try {
            let signature = await market.cancelOrder(connection, owner, order);
            console.log("Sell order cancelled, waiting for finalization");
            try {
              await awaitForTxnFinalization(signature, connection);
              sellReady = true;
            } catch (error) {
              console.log(error);
            }
            console.log("Transaction finalized");
          } catch (error) {
            sellReady = false;
            console.log("Retrying to cancel sell order...");
          }
        }
      }
      if (sellReady === true && spread > 0.2) {
        try {
          let size = Math.round(Math.random() * (30000 - 15000) + 15000);
          let signature = await market.placeOrder(connection, {
            owner,
            payer: foxyAccount,
            side: "sell", // 'buy' or 'sell'
            price: topAskPrice - 0.000001,
            size: size,
            orderType: "limit", // 'limit', 'ioc', 'postOnly'
          });
          console.log("Sell order placed, waiting for finalization...");
          try {
            await awaitForTxnFinalization(signature, connection);
            sellReady = false;
          } catch (error) {
            console.log(error);
          }
          console.log("Transaction finalized");
        } catch (error) {
          console.log("Retrying to place sell order...");
        }
      }
    }

    if (
      (topBidPrice > myBuyOrderPrice || topBidSize > buyOrdersSizeSum) &&
      topBidPrice < 0.006
    ) {
      for (let order of myOrders) {
        if (order.side === "buy") {
          try {
            let signature = await market.cancelOrder(connection, owner, order);
            console.log("Buy order cancelled, waiting for finalization");
            try {
              await awaitForTxnFinalization(signature, connection);
              buyReady = true;
            } catch (error) {
              console.log(error);
            }
            console.log("Transaction finalized");
          } catch (error) {
            buyReady = false;
            console.log("Retrying to cancel buy order...");
          }
        }
      }
      if (buyReady === true) {
        try {
          let size = Math.round(Math.random() * (30000 - 15000) + 15000);
          //let size = 10;
          let signature = await market.placeOrder(connection, {
            owner,
            payer: usdcAccount,
            side: "buy", // 'buy' or 'sell'
            price: topBidPrice + 0.000001,
            size: size,
            orderType: "limit", // 'limit', 'ioc', 'postOnly'
          });
          console.log("Buy order placed, waiting for finalization...");
          try {
            await awaitForTxnFinalization(signature, connection);
            buyReady = false;
          } catch (error) {
            console.log(error);
          }
          console.log("Transaction finalized");
        } catch (error) {
          console.log("Retrying to place buy order......");
        }
      }
    }
    await timer(10000);
  }
};

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
