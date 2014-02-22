const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/Task.jsm');
Cu.import('resource://shrunked/shrunked.jsm');

const IS_FIREFOX = Services.appinfo.name == 'Firefox';
const IS_THUNDERBIRD = Services.appinfo.name == 'Thunderbird';

for (let element of document.querySelectorAll('[id]')) {
	window[element.id] = element;
}

function load() {
	let maxWidth = p_maxwidth.value;
	let maxHeight = p_maxheight.value;
	if (maxWidth == 500 && maxHeight == 500) {
		rg_size.selectedIndex = 0;
	} else if (maxWidth == 800 && maxHeight == 800) {
		rg_size.selectedIndex = 1;
	} else if (maxWidth == 1200 && maxHeight == 1200) {
		rg_size.selectedIndex = 2;
	} else {
		rg_size.selectedIndex = 3;
		tb_width.value = maxWidth;
		tb_height.value = maxHeight;
	}
	setSize();

	s_quality.value = p_quality.value;

	if (IS_THUNDERBIRD) {
		t_sites.hidden = true;
	} else {
		Task.spawn(function() {
			let data = new Map();
			for (let name of ['disabled', 'maxWidth', 'maxHeight']) {
				let prefs = yield Shrunked.getAllContentPrefs('extensions.shrunked.' + name);
				for (let [domain, value] of prefs) {
					let site = data.get(domain) || {};
					site[name] = value;
					data.set(domain, site);
				}
			}

			handleData(data);
		});
	}

	enableExif();

	window.sizeToContent();
}

function setSize() {
	l_width.disabled = tb_width.disabled =
		l_height.disabled = tb_height.disabled = !r_custom.selected;
	if (r_small.selected) {
		p_maxwidth.value = 500;
		p_maxheight.value = 500;
	} else if (r_medium.selected) {
		p_maxwidth.value = 800;
		p_maxheight.value = 800;
	} else if (r_large.selected) {
		p_maxwidth.value = 1200;
		p_maxheight.value = 1200;
	} else {
		p_maxwidth.value = tb_width.value;
		p_maxheight.value = tb_height.value;
	}
}

function enableExif() {
	cb_orient.disabled = cb_gps.disabled = !cb_exif.checked;
}

function handleData(data) {
	for (let [domain, prefs] of data) {
		if (prefs.disabled) {
			let item = document.createElement('listitem');
			item.setAttribute('style', 'color: #666; font-style: italic');
			let siteCell = document.createElement('listcell');
			siteCell.setAttribute('label', domain);
			item.appendChild(siteCell);
			let disabledCell = document.createElement('listcell');
			disabledCell.setAttribute('label', strings.getString('disabled'));
			disabledCell.setAttribute('style', 'text-align: center');
			item.appendChild(disabledCell);
			lb_sites.appendChild(item);
		}
		if (prefs.maxWidth && prefs.maxHeight) {
			let item = document.createElement('listitem');
			let siteCell = document.createElement('listcell');
			siteCell.setAttribute('label', domain);
			item.appendChild(siteCell);
			let widthCell = document.createElement('listcell');
			widthCell.setAttribute('label', strings.getFormattedString('dimensions', [prefs.maxWidth, prefs.maxHeight]));
			widthCell.setAttribute('style', 'text-align: center');
			item.appendChild(widthCell);
			lb_sites.appendChild(item);
		}
	}
}

function enableForget() {
	b_forget.disabled = lb_sites.selectedItem == null;
}

function forgetSite() {
	let item = lb_sites.getSelectedItem(0);
	if (item) {
		let site = item.firstChild.getAttribute('label');
		let uri = Services.io.newURI('http://' + site + '/', null, null);

		Shrunked.contentPrefs2.removeByDomainAndName(uri.host, 'extensions.shrunked.maxHeight', null);
		Shrunked.contentPrefs2.removeByDomainAndName(uri.host, 'extensions.shrunked.maxWidth', null);
		Shrunked.contentPrefs2.removeByDomainAndName(uri.host, 'extensions.shrunked.disabled', null);

		lb_sites.removeChild(item);
	}
}
