tmp_form = """
<body style="background-color:#817561;color:whitesmoke; margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;">
       <style>
           .center {
               display: flex;
               flex-direction: column;
               align-items: center;
               text-align: center;
           }
           .center h3 {
               margin-bottom: 20px;
           }
           form {
               display: flex;
               flex-direction: column;
               gap: 10px;
               width: 100%;
               max-width: 300px;
           }
           input[type="text"] {
               padding: 10px;
               font-size: 16px;
               border-radius: 5px;
               border: 1px solid #ccc;
           }
           input[type="submit"] {
               padding: 10px;
               font-size: 16px;
               color: whitesmoke;
               background-color: #444;
               border: none;
               border-radius: 5px;
               cursor: pointer;
           }
           input[type="submit"]:hover {
               background-color: #555;
           }
           @media (max-width: 600px) {
               .center {
                   width: 100%;
                   padding: 20px;
               }
               form {
                   max-width: 100%;
               }
               input[type="text"], input[type="submit"] {
                   font-size: 14px;
               }
           }
       </style>
       <div class="center">
           <h3>TT-Click-URL</h3>
           <form action="/" method="get">
               <input type="text" name="tt-url" placeholder="URL"> 
               <input type="submit" value="Submit">
           </form>
       </div>
   </body>
"""

def tmp_base(input):
    return f"""
    <body style="background-color:#817561;color:whitesmoke">
        <style>
            .center {{
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 40px;
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: center;
            }}
            @media (max-width: 600px) {{
                .center {{
                    font-size: 20px;
                    flex-direction: column;
                }}
            }}
        </style>
        {input}
    </body>
    """
