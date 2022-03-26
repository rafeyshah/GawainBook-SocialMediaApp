import { useRef } from "react";
import "./register.css"

export default function Register() {
    const username = useRef();
    const email = useRef();
    const password = useRef();
    const passwordAgain = useRef();

    const handleClick = async (e) =>{
        e.preventDefault();
        if (passwordAgain.current.value !== password.current.value){
            passwordAgain.current.setCustomValidity("Passwords don't match!")
        }else{
            const user = {
                username: username.current.value,
                email: email.current.value,
                password: password.current.value,
            }
            try{
                await axios.post("/auth/register", user)
            }catch(err){
                console.log(err)
            }
        }
    }

    return (
        <div className="login">
            <div className="loginWrapper">
                <div className="loginLeft">
                    <h3 className="loginLogo">GawainBook</h3>
                    <span className="loginDesc">
                        Connect with friends and the world around you on GawainBook.
                    </span>
                </div>
                <div className="loginRight">
                    <form className="loginBox" onSubmit={handleClick}>
                        <input placeholder="Username" required ref={username} className="loginInput" />
                        <input placeholder="Email" type="email" required ref={email} className="loginInput" />
                        <input placeholder="Password" type="password" minLength="6" required ref={password} class className="loginInput" />
                        <input placeholder="Password Again" type="password" required ref={passwordAgain} className="loginInput" />
                        <button type="submit" className="loginButton">Sign Up</button>
                        <button className="loginRegisterButton">
                            Login into Account
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
