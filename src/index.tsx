import express, { Express, Request, Response } from "express";

// Server setup
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const app: Express = express();
var jwt = require("jsonwebtoken");

// middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
  })
);
app.use(express.json());
// port and db connection
const port = process.env.PORT || 5000;

// database information
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PWD}@cluster0.8bccj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// verifying jwt token
const verifyJWT = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(403).send({ message: "Unauthorized Access" });

  const token = authHeader.split(" ")[1];

  if (token) {
    jwt.verify(
      token,
      process.env.ACCESS_TOKEN,
      function (err: any, decoded: any) {
        if (err) {
          return res.status(401).send({ message: err.message });
        }
        req.decoded = decoded;
        next();
      }
    );
  }
};

async function run() {
  try {
    await client.connect();
    // product collection
    const productsCollection = client.db("Products").collection("product");
    const cartCollection = client.db("Products").collection("cart");
    const orderCollection = client.db("Products").collection("orders");
    const userCollection = client.db("Users").collection("user");
    const reviewCollection = client.db("Products").collection("review");

    // // verify owner
    const verifyOwner = async (req: Request, res: Response, next: any) => {
      const authEmail = req.decoded.email;
      const findOwnerInDB = await userCollection.findOne({
        email: authEmail && authEmail,
      });

      if (findOwnerInDB.role === "owner") {
        next();
      } else {
        res.status(403).send({ message: "Unauthorized" });
      }
    };

    // get products by some condition in manage product page api
    app.get("/api/manage-product", async (req: Request, res: Response) => {
      let item: any;
      let page: any;
      let email: any = req.query.email;
      item = req.query.items;
      page = req.query.page;
      let searchText: any = req.query.search;
      let filters: any = req.query.category;
      let cursor: any;
      let result: any;

      const searchQuery = (sTxt: string, email: string = "") => {
        item = "";
        page = "";
        let findProduct: any = {
          $or: [
            { title: { $regex: sTxt, $options: "i" } },
            { seller: { $regex: sTxt, $options: "i" } },
          ],
        };
        if (email) {
          findProduct["seller"] = email;
        }
        return findProduct;
      };

      const filterQuery = (category: string, email: string = "") => {
        item = "";
        page = "";
        let findProduct: any = {
          category: category,
        };
        if (email) {
          findProduct["seller"] = email;
        }
        return findProduct;
      };

      cursor =
        searchText && searchText.length > 0
          ? productsCollection.find(searchQuery(searchText, email || ""))
          : filters && filters !== "all"
          ? productsCollection.find(filterQuery(filters, email || ""))
          : productsCollection.find((email && { seller: email }) || {});

      if (item || page) {
        result = await cursor
          .skip(parseInt(page) * parseInt(item))
          .limit(parseInt(item))
          .toArray();
      } else {
        result = await cursor.toArray();
      }
      res.status(200).send(result);
    });

    // product count
    app.get("/api/product-count", async (req: Request, res: Response) => {
      const email = req.query.email;
      let result = await productsCollection.countDocuments(
        email && { seller: email }
      );
      res.status(200).send({ count: result });
    });

    // Delete product from manage product page
    app.delete(
      "/api/delete-product/:productId",
      async (req: Request, res: Response) => {
        const productId: string = req.params.productId;
        const result = await productsCollection.deleteOne({
          _id: ObjectId(productId),
        });
        result
          ? res.status(200).send({ message: "Product deleted successfully." })
          : res.status(503).send({ message: "Service unavailable" });
      }
    );

    // update product information
    app.put(
      "/api/update-product/:productId",
      async (req: Request, res: Response) => {
        const productId = req.params.productId;
        const body = req.body;
        let available = body?.available;

        if (available && available >= 1) {
          body["stock"] = "in";
        } else {
          body["stock"] = "out";
        }
        const result = await productsCollection.updateOne(
          { _id: ObjectId(productId) },
          {
            $set: body,
          },
          { upsert: true }
        );

        res
          .status(200)
          .send(result && { message: "Product updated successfully" });
      }
    );

    // update data
    app.put(
      "/update-profile-data/:email",
      async (req: Request, res: Response) => {
        const email: string = req.params.email;
        const result = await userCollection.updateOne(
          { email: email },
          { $set: req.body },
          { upsert: true }
        );
        res.status(200).send(result);
      }
    );

    // fetch myProfile data in my profile page
    app.get("/my-profile/:email", async (req: Request, res: Response) => {
      const email = req.params.email;
      res.status(200).send(await userCollection.findOne({ email: email }));
    });

    // make admin request
    app.put(
      "/make-admin/:userId",
      verifyJWT,
      verifyOwner,
      async (req: Request, res: Response) => {
        const userId: string = req.params.userId;
        res.status(200).send(
          await userCollection.updateOne(
            { _id: ObjectId(userId) },
            { $set: { role: "admin" } },
            { upsert: true }
          )
        );
      }
    );

    // get all user in allUser Page
    app.get("/api/manage-user", async (req: Request, res: Response) => {
      const uType = req.query.uTyp;
      res.status(200).send(await userCollection.find({ role: uType }).toArray());
    });

    // get owner, admin and user from database
    app.get("/fetch-auth/:email", async (req: Request, res: Response) => {
      const email = req.params.email;
      const token = req.headers.authorization?.split(" ")[1];

      if (token) {
        const result = await userCollection.findOne({ email: email });

        if (result && result.role === "owner") {
          res.status(200).send({ role: "owner" });
        }

        if (result && result.role === "admin") {
          res.status(200).send({ role: "admin" });
        }
      } else {
        return res.status(403).send({ message: "Header Missing" });
      }
    });

    // add user to the database
    app.put("/user/:email", async (req: Request, res: Response) => {
      const email: string = req.params.email;
      const findUser = await userCollection.findOne({ email: email });

      let updateDocuments;

      updateDocuments =
        findUser && findUser?.role !== ""
          ? { $set: { email } }
          : { $set: { email, role: "user" } };

      const result = await userCollection.updateOne(
        { email: email },
        updateDocuments,
        { upsert: true }
      );
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
        algorithm: "HS256",
        expiresIn: "6h",
      });
      res.status(200).send({ result, token });
    });

    // inserting product into database
    app.post("/add-product", async (req: Request, res: Response) => {
      const body = req.body;
      let available = body?.available;

      if (available && available >= 1) {
        body["stock"] = "in";
      } else {
        body["stock"] = "out";
      }
      res.status(200).send(await productsCollection.insertOne(body));
    });

    // finding all Products
    app.get("/products", async (req: Request, res: Response) => {
      const results = await productsCollection.find({}).toArray();
      res.send(results);
    });

    // Finding one specific particular product
    app.get("/products/:productId", async (req: Request, res: Response) => {
      const productId: string = req.params.productId;
      const q = {
        _id: ObjectId(productId),
      };
      const results = await productsCollection.findOne(q);
      res.send(results);
    });

    // Fetch single product
    // check in  cart and view product
    app.get(
      "/api/fetch-single-product/:productId/:email",
      async (req: Request, res: Response) => {
        const email = req.params.email;
        const productId = req.params.productId;
        const filterP = await cartCollection
          .aggregate([
            { $unwind: "$product" },
            { $match: { user_email: email, "product._id": productId } },
          ])
          .toArray();

        let result = await productsCollection.findOne({
          _id: ObjectId(productId),
        });

        const exist = filterP.some((f: any) => f?.product?._id === productId);

        let cardHandler: boolean;
        if (exist) {
          cardHandler = true;
        } else {
          cardHandler = false;
        }
        result["cardHandler"] = cardHandler;
        res.send(result);
      }
    );

    // fetch product by category
    app.get(
      "/product-category/:category",
      async (req: Request, res: Response) => {
        const productCategory = req.params.category;
        const findP = await productsCollection
          .find({
            category: productCategory,
          })
          .toArray();
        res.send(findP);
      }
    );

    // upsert review in product
    app.put("/add-rating/:email", async (req: Request, res: Response) => {
      const email = req.params.email;
      const body = req.body;
      let newRating;

      const findRating = await reviewCollection.findOne({
        user_email: email,
      });
      if (findRating) {
        const productArr: any[] = findRating?.rating ? findRating?.rating : [];
        if (productArr.length > 0) {
          for (let i = 0; i < productArr.length; i++) {
            let elem = productArr[i].rating_id;
            if (elem === body?.rating_id) {
              res.send({ message: "Product Has Already In Your Cart" });
              return;
            } else {
              newRating = [...productArr, body];
            }
          }
        } else {
          newRating = [body];
        }
      } else {
        newRating = [body];
      }

      const products = await productsCollection.findOne({
        _id: ObjectId(body?.product_id),
      });

      const point = parseInt(body?.rating_point);

      let newRatingPoint = products?.rating;

      let rat1: any = parseInt(newRatingPoint[4]?.count) || 0;
      let rat2: any = parseInt(newRatingPoint[3]?.count) || 0;
      let rat3: any = parseInt(newRatingPoint[2]?.count) || 0;
      let rat4: any = parseInt(newRatingPoint[1]?.count) || 0;
      let rat5: any = parseInt(newRatingPoint[0]?.count) || 0;

      if (point === 5) {
        rat5 += 1;
      } else if (point === 4) {
        rat4 += 1;
      } else if (point === 3) {
        rat3 += 1;
      } else if (point === 2) {
        rat2 += 1;
      } else {
        rat1 += 1;
      }

      let ratingArr: any[] = [
        { weight: 5, count: rat5 },
        { weight: 4, count: rat4 },
        { weight: 3, count: rat3 },
        { weight: 2, count: rat2 },
        { weight: 1, count: rat1 },
      ];

      await productsCollection.updateOne(
        { _id: ObjectId(body?.product_id) },
        { $set: { rating: ratingArr } },
        { upsert: true }
      );

      const result = await reviewCollection.updateOne(
        { user_email: email },
        { $set: { rating: newRating } },
        { upsert: true }
      );
      res.send(result);
    });

    // my review
    app.get("/my-review/:email", async (req: Request, res: Response) => {
      const email = req.params.email;
      const result = await reviewCollection
        .aggregate([{ $unwind: "$rating" }, { $match: { user_email: email } }])
        .toArray();
      res.send(result);
    });

    // product review fetch
    app.get(
      "/product-review/:productId",
      async (req: Request, res: Response) => {
        const productId = req.params.productId;
        const result = await reviewCollection
          .aggregate([
            { $unwind: "$rating" },
            { $match: { "rating.product_id": productId } },
          ])
          .toArray();
        res.send(result);
      }
    );

    // fetch my added product in my cart page
    app.get(
      "/my-cart-items/:userEmail",
      async (req: Request, res: Response) => {
        const userEmail = req.params.userEmail;
        const result = await cartCollection.findOne({ user_email: userEmail });

        if (result) {
          await cartCollection.updateOne(
            { user_email: userEmail },
            { $pull: { product: { stock: "out" } } }
          );
        }
        res.status(200).send(result);
      }
    );

    // update quantity of product in my-cart
    app.put(
      "/api/update-product-quantity/:productId/:email",
      async (req: Request, res: Response) => {
        const productId = req.params.productId;
        const userEmail = req.params.email;
        const { quantity, price_total, discount_amount_total } = req.body;
        const result = await cartCollection.updateOne(
          { user_email: userEmail, "product._id": productId },
          {
            $set: {
              "product.$.quantity": quantity,
              "product.$.price_total": price_total,
              "product.$.discount_amount_total": discount_amount_total,
            },
          },
          { upsert: true }
        );
        res.status(200).send(result);
      }
    );

    // remove item form cart with item cart id and email
    app.delete(
      "/delete-cart-item/:productId/:email",
      async (req: Request, res: Response) => {
        const productId = req.params.productId;
        const userEmail = req.params.email;
        const result = await cartCollection.updateOne(
          { user_email: userEmail },
          { $pull: { product: { _id: productId } } }
        );
        res
          .status(200)
          .send({ result, message: `removed successfully from cart` });
      }
    );

    // inserting product into my cart api
    app.put("/api/add-to-cart/:email", async (req: Request, res: Response) => {
      let newProduct: any;
      const email: string = req.params.email;
      const body = req.body;
      const options = { upsert: true };
      const query = { user_email: email };

      if (body?.stock === "in" && body?.available > 0) {
        const existsProduct = await cartCollection.findOne({
          user_email: email,
        });
        if (existsProduct) {
          const productArr: any[] = existsProduct?.product
            ? existsProduct?.product
            : [];
          if (productArr.length > 0) {
            for (let i = 0; i < productArr.length; i++) {
              let elem = productArr[i]._id;
              if (elem === body?._id) {
                res.send({ message: "Product Has Already In Your Cart" });
                return;
              } else {
                newProduct = [...productArr, body];
              }
            }
          } else {
            newProduct = [body];
          }
        } else {
          newProduct = [body];
        }

        const up = {
          $set: { product: newProduct },
        };

        const cartRes = await cartCollection.updateOne(query, up, options);
        res.send({
          data: cartRes,
          message: "Product Successfully Added To Your Cart",
        });
      }
    });

    // update cart items
    app.put(
      "/api/update-cart-items/:email/:productId",
      async (req: Request, res: Response) => {
        const productId = req.params.productId;
        const email: string = req.params.email;
        const {
          quantity,
          price,
          discount_amount_fixed,
          discount_amount_total,
          discount,
          price_total,
          price_fixed,
          stock,
          available,
          modifiedAt,
        } = req.body;

        const result = await cartCollection.updateOne(
          { user_email: email, "product._id": productId },
          {
            $set: {
              "product.$.quantity": quantity,
              "product.$.price": price,
              "product.$.discount": discount,
              "product.$.price_total": price_total,
              "product.$.price_fixed": price_fixed,
              "product.$.discount_amount_fixed": discount_amount_fixed,
              "product.$.discount_amount_total": discount_amount_total,
              "product.$.stock": stock,
              "product.$.available": available,
              "product.$.modifiedAt": modifiedAt,
            },
          },
          { upsert: true }
        );
        res.status(200).send(result);
      }
    );

    // inserting address in cart
    app.post(
      "/api/add-cart-address/:userEmail",
      async (req: Request, res: Response) => {
        const userEmail = req.params.userEmail;
        const body = req.body;
        const result = await cartCollection.updateOne(
          { user_email: userEmail },
          { $push: { address: body } },
          { upsert: true }
        );
        res.send(result);
      }
    );

    // order address add api
    app.put(
      "/api/update-cart-address/:userEmail",
      async (req: Request, res: Response) => {
        const userEmail = req.params.userEmail;
        const body = req.body;

        const result = await cartCollection.updateOne(
          { user_email: userEmail },
          {
            $set: {
              "address.$[i]": body,
            },
          },
          { arrayFilters: [{ "i.addressId": body?.addressId }] }
        );
        res.send(result);
      }
    );

    // update select_address in address to confirm for order api
    app.put(
      "/api/select-address/:userEmail",
      async (req: Request, res: Response) => {
        const userEmail = req.params.userEmail;
        const { addressId, select_address } = req.body;

        const addr = await cartCollection.findOne({ user_email: userEmail });
        if (addr) {
          const addressArr = addr?.address;

          if (addressArr && addressArr.length > 0) {
            await cartCollection.updateOne(
              { user_email: userEmail },
              {
                $set: {
                  "address.$[j].select_address": false,
                },
              },
              {
                arrayFilters: [{ "j.addressId": { $ne: addressId } }],
                multi: true,
              }
            );
          }
        }

        let result = await cartCollection.updateOne(
          { user_email: userEmail },
          {
            $set: {
              "address.$[i].select_address": select_address,
            },
          },
          { arrayFilters: [{ "i.addressId": addressId }] }
        );

        res.status(200).send(result);
      }
    );

    // delete or remove address from cart
    app.delete(
      "/api/delete-cart-address/:email/:addressId",
      async (req: Request, res: Response) => {
        const email = req.params.email;
        const addressId = parseInt(req.params.addressId);
        const result = await cartCollection.updateOne(
          { user_email: email },
          { $pull: { address: { addressId } } }
        );
        res.send(result);
      }
    );

    // get order address
    app.get("/cart-address/:userEmail", async (req: Request, res: Response) => {
      const userEmail = req.params.userEmail;
      const result = await cartCollection.findOne({
        user_email: userEmail,
      });
      res.send(result);
    });

    /*+++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
      This is order section api operation
    +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    +++++++++++++++++++++++++++++++++++++++++++++++++++++++++ */
    // set order api call
    app.post("/set-order/:userEmail", async (req: Request, res: Response) => {
      const userEmail: string = req.params.userEmail;
      const body: string = req.body;

      if (!body) {
        res.send({
          message: "Order Cancelled. You Have To Select At least One Product",
        });
      } else {
        const result = await orderCollection.updateOne(
          { user_email: userEmail },
          { $push: { orders: body } },
          { upsert: true }
        );
        res.send(result);
      }
    });

    // get my order list in my-order page
    app.get("/my-order/:email", async (req: Request, res: Response) => {
      const email = req.params.email;
      res.send(await orderCollection.findOne({ user_email: email }));
    });

    // cancel orders from admin
    app.delete(
      "/api/remove-order/:email/:orderId",
      async (req: Request, res: Response) => {
        const email = req.params.email;
        const id = parseInt(req.params.orderId);

        const result = await orderCollection.updateOne(
          { user_email: email },
          { $pull: { orders: { orderId: id } } }
        );

        res.send({ result, message: "Order Removed successfully" });
      }
    );

    // cancel my orders
    app.put(
      "/api/cancel-my-order/:userEmail/:orderId",
      async (req: Request, res: Response) => {
        const userEmail = req.params.userEmail;
        const orderId = parseInt(req.params.orderId);
        const { status, cancel_reason, time_canceled } = req.body;
        const result = await orderCollection.updateOne(
          { user_email: userEmail },
          {
            $set: {
              "orders.$[i].status": status,
              "orders.$[i].cancel_reason": cancel_reason,
              "orders.$[i].time_canceled": time_canceled,
            },
          },
          { arrayFilters: [{ "i.orderId": orderId }] }
        );
        res.send({ result, message: "Order canceled successfully" });
      }
    );

    // update order status by admin or product owner
    app.put(
      "/update-order-status/:status/:user_email/:id",
      async (req: Request, res: Response) => {
        const orderId = parseInt(req.params.id);
        const status = req.params.status;
        const userEmail = req.params.user_email;
        const {
          ownerCommission,
          totalEarn,
          seller_email,
          productId,
          quantity,
        } = req.body;
        let time: string = new Date().toLocaleString();
        let upDoc: any;

        if (status === "placed") {
          upDoc = {
            $set: {
              "orders.$[i].status": status,
              "orders.$[i].time_placed": time,
            },
          };
        } else if (status === "shipped") {
          upDoc = {
            $set: {
              "orders.$[i].status": status,
              "orders.$[i].time_shipped": time,
            },
          };

          if (ownerCommission && totalEarn) {
            const ownerCol = await userCollection.findOne({ role: "owner" });
            let adminCol = await userCollection.findOne({
              email: seller_email,
            });
            if (ownerCol) {
              let ownerTotalEarn = ownerCol?.total_earn;
              let ownerComm = parseFloat(ownerCommission);
              let earn = parseFloat(ownerTotalEarn) + ownerComm;
              await userCollection.updateOne(
                { role: "owner" },
                { $set: { total_earn: earn } },
                { upsert: true }
              );
            }

            if (adminCol) {
              let totalEarned = adminCol?.total_earn;
              let totalEr = parseFloat(totalEarn);
              totalEarned = parseFloat(totalEarned) + totalEr;
              await userCollection.updateOne(
                { email: seller_email },
                { $set: { total_earn: totalEarned } },
                { upsert: true }
              );
            }
          }

          if (productId) {
            let product = await productsCollection.findOne({
              _id: ObjectId(productId),
            });
            let available = parseInt(product?.available) - parseInt(quantity);
            let top_sell =
              (parseInt(product?.top_sell) || 0) + parseInt(quantity);

            let stock: string;
            if (available >= 1) {
              stock = "in";
            } else {
              stock = "out";
            }

            await productsCollection.updateOne(
              { _id: ObjectId(productId) },
              { $set: { available, stock, top_sell } },
              { upsert: true }
            );
          }
        }

        const result = await orderCollection.updateOne(
          { user_email: userEmail },
          upDoc,
          { arrayFilters: [{ "i.orderId": orderId }] }
        );
        res.send(result);
      }
    );

    // get order list
    app.get("/api/checkout/:cartId", async (req: Request, res: Response) => {
      const cartId = req.params.cartId;
      const result = await cartCollection.findOne({ _id: ObjectId(cartId) });
      res.send(result);
    });

    /// find orderId
    app.get("/manage-orders", async (req: Request, res: Response) => {
      const email = req.query.email;
      let result: any;

      if (email) {
        result = await orderCollection
          .aggregate([
            { $unwind: "$orders" },
            {
              $match: {
                "orders.seller": email,
              },
            },
          ])
          .toArray();
      } else {
        result = await orderCollection
          .aggregate([{ $unwind: "$orders" }])
          .toArray();
      }

      res.status(200).send(result);
    });
  } finally {
  }
}
run();

app.get("/", (req: Request, res: Response) => {
  res.status(200).send("Woo-Com Server is running");
});

app.listen(port, () => {
  console.log(`Running port is ${port}`);
});
