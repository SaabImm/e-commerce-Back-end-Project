const jwt= require('jsonwebtoken')

const authenticate = (req, res, next)=> {
    const authHeader= req.headers.authorization

    //verifies if token exists
    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({message: "No Token Provided!!"})
    } 

    //taken token apart from "Bearer"
    const token= authHeader.split(" ")[1]

    //verifies the viability o the token against the secret key
    try{
        const decoded= jwt.verify(token, process.env.JWT_SECRET)
        req.user= decoded;
    }

    catch(error){
        return res.status(401).json({message: "No Token Provided!!", error: error})
        
    }
}