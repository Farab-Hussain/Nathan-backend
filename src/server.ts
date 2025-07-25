import express, { Request, Response } from 'express';
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config();

const app = express();
const port = process.env.PORT || 5050

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  console.log('Hello world');
  res.send('Hello world');
});

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
})