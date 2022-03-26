import {createContext, useReducer} from 'react';
import AuthReducer from './AuthReducer'

const INITIAL_STATE = {
    user: {
        "_id": "61fe4a02f5481b339090c3e3",
        "username": "ali",
        "email": "ali@gmail.com",
        "password": "$2b$10$wKl7w.vdJT7s0iboqmsk9OMjfTgCn4lF07M73hyz.AxsvzhO5bYfC",
        "profilePicture": "",
        "coverPicture": "",
        "followers": [
            "61fe4ecb0f5a90b481623b5f"
        ],
        "followings": [],
        "isAdmin": false,
        "createdAt": "2022-02-05T09:57:22.675Z",
        "updatedAt": "2022-02-05T16:42:45.009Z",
        "__v": 0
    },
    isFetching: false,
    error: false,
}

export const AuthContext = createContext(INITIAL_STATE)

export const AuthContextProvider = ({children}) =>{
    const [state, dispatch] = useReducer(AuthReducer, INITIAL_STATE)

    return(
        <AuthContext.Provider value={{user: state.user, isFetching: state.isFetching, error: state.error, dispatch}}>
            {children}
        </AuthContext.Provider>
    )
}