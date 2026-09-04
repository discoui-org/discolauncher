import"./chunks/script-BAePFqaD.js";function e(){if(document.body.classList.add(`mock-pointer`),document.querySelector(`div#m_pointer_0000HELLYEAH`))return document.querySelector(`div#m_pointer_0000HELLYEAH`);let e=document.createElement(`div`);return e.id=`m_pointer_0000HELLYEAH`,e.style.cssText=`
        position: fixed;
        transform: translate(-50%, -50%);
        z-index: 999999999;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        pointer-events: none;
        background: rgb(255, 255, 255, .5);
        box-shadow: inset 0px 0px 0px 2px rgb(255, 255, 255, .5;
    `,document.body.append(e),e}document.body.addEventListener(`pointerenter`,t=>{let n=e();n.style.left=t.pageX+`px`,n.style.top=t.pageY+`px`}),window.addEventListener(`pointermove`,t=>{let n=e();n.style.left=t.pageX+`px`,n.style.top=t.pageY+`px`}),document.body.addEventListener(`pointerleave`,t=>{e().remove()});