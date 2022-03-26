import "./login.css"
import { useRef } from 'react';

export default function Login() {
    const email = useRef();
    const password = useRef();

    const handleClick = (e) => {
        e.preventDefault();
        console.log(email.current.value)
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
                        <input placeholder="Email" required type="email" className="loginInput" ref={email} />
                        <input placeholder="Password" required minLength="6" className="loginInput" ref={password} type="password"  />
                        <button className="loginButton">Log In</button>
                        <span className="loginForgot">Forgot Password?</span>
                        <button className="loginRegisterButton">
                            Create a New Account
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
