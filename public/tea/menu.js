(function(root){
  const menu = {
    tea: { price:5000, drink:true, en:'Iced tea', vi:'Trà đá' },
    snack: { price:10000, drink:false, en:'Snack plate', vi:'Đĩa bánh' },
    lemonade: { price:10000, drink:true, en:'Lemon tea', vi:'Trà chanh' },
    coffee: { price:15000, drink:true, en:'Iced milk coffee', vi:'Cà phê sữa đá' },
    seeds: { price:10000, drink:false, en:'Sunflower seeds', vi:'Hạt hướng dương' },
  };
  if(typeof module==='object'&&module.exports)module.exports=menu;
  else root.TeaMenu=menu;
})(typeof window!=='undefined'?window:globalThis);
