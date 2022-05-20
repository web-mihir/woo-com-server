// Server setup
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();

// middleware
app.use(cors());
app.use(express.json());

// port and db connection
const port = process.env.PORT || 5000;

// database information
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PWD}@cluster0.8bccj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
   try {
      await client.connect();
      // product collection
      const productsCollection = client.db('Products').collection('product');

      // finding all Products
      app.get('/products', async (req, res) => {
         const results = await productsCollection.find({}).toArray();
         res.send(results);
      });

      // Finding one specific particular product
      app.get('/products/:productId', async (req, res) => {
         const productId = req.params.productId;
         const q = {
            _id: ObjectId(productId)
         }
         const results = await productsCollection.findOne(q);
         res.send(results);
      });


      // inserting user
      app.put('/user', async(req, res) => {
         const uid = req.query.uid;
      });



   } finally {

   }
}
run().catch(console.dir())

app.get('/', (req, res) => {
   res.send("Server running");
});

app.listen(port, () => {
   console.log(`Running port is ${port}`);
});
