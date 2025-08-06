import { Router } from "express";
import { register } from "../controller/authController";
import { login } from "../controller/authController";
import { googleOAuth } from "../controller/authController";

const route = Router()

route.post('/register',register);
route.post('/login',login);

route.post('/google',googleOAuth);

export default route
