import React from "react";
import { Link } from "react-router-dom";

function Navbar() {

  return (

    <div style={{
      background:"#111",
      padding:"15px",
      display:"flex",
      gap:"20px"
    }}>

      <Link to="/devices" style={{color:"white"}}>Devices</Link>

      <Link to="/evidence" style={{color:"white"}}>Evidence</Link>

      <Link to="/" style={{color:"white"}}>Logout</Link>

    </div>

  );

}

export default Navbar;