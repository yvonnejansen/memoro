// adds a menu to a page
var links = {'Events': 'events',
				'Log': 'log'
			};
var menu = document.createElement('ul');
menu.id = 'menu';
for (let l in links){
	var p = document.createElement('li');
	var a = document.createElement('a');
	a.setAttribute('href', links[l]);
	a.innerText = l;
	p.appendChild(a);
	menu.appendChild(p);
}

var b = document.getElementById("main");
b.prepend(menu);