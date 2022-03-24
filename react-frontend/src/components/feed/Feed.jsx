import { useEffect, useState } from "react";
import Post from "../post/Post";
import Share from "../share/Share";
import "./feed.css";
import axios from "axios";

function Feed({ username }) {
    const [posts, setPosts] = useState([])

    useEffect(async () => {
        const fetchPosts = async () => {
            const res = username 
            ? await axios.get('/posts/profile/' + username) 
            : await axios.get('posts/timeline/61fe4ecb0f5a90b481623b5f');
            setPosts(res.data)
        }
        fetchPosts()
    }, [])

    return (
        <div className="feed">
            <div className="feedWrapper">
                <Share />
                {
                    posts.map((p) => (
                        <Post key={p._id} post={p} />

                    ))
                }
            </div>
        </div>
    );
}

export default Feed;
