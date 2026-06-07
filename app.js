/* ===== Bubble Stock PWA — logique client =====
   Navigation instantanée (hash router) + cache local (affichage immédiat, rafraîchi en arrière-plan).
   Toutes les écritures passent par l'API Apps Script (POST JSON). */

(function () {
  'use strict';

  var CFG = window.BS_CONFIG;
  var $app = document.getElementById('app');
  var $loader = document.getElementById('loader');
  var $topbar = document.getElementById('topbar');
  var $title = document.getElementById('topbar-title');
  var $back = document.getElementById('btn-back');
  var $logout = document.getElementById('btn-logout');
  var $toast = document.getElementById('toast');

  /* ---------- état ---------- */
  var state = {
    pin: localStorage.getItem('bs_pin') || '',
    role: localStorage.getItem('bs_role') || ''
  };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function loader(on) { $loader.classList.toggle('is-hidden', !on); }
  var toastTimer;
  function toast(msg, isErr) {
    $toast.textContent = msg;
    $toast.classList.toggle('is-erreur', !!isErr);
    $toast.classList.remove('is-hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.add('is-hidden'); }, 2600);
  }

  /* ---------- API ---------- */
  function api(body) {
    body = body || {};
    body.pin = body.pin || state.pin;
    loader(true);
    return fetch(CFG.API_URL + '?api=1', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request => pas de préflight CORS
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        loader(false);
        if (!j.ok) throw new Error(j.error || 'Erreur API');
        return j;
      })
      .catch(function (e) { loader(false); throw e; });
  }

  /* ---------- cache local (affichage instantané) ---------- */
  function cacheGet(key) {
    try { return JSON.parse(localStorage.getItem('bs_c_' + key)); } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem('bs_c_' + key, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  }
  // Rend depuis le cache si dispo, puis rafraîchit en arrière-plan et re-rend
  function cached(key, fetcher, render) {
    var c = cacheGet(key);
    if (c) render(c.data, true);
    else $app.innerHTML = '<p class="vide">Chargement…</p>'; // 1re visite : état d'attente
    fetcher().then(function (data) {
      cacheSet(key, data);
      // ne re-rend que si on est toujours sur la même vue
      if (location.hash === renderedHash) render(data, false);
    }).catch(function (e) {
      if (!c) $app.innerHTML = '<p class="vide">Erreur : ' + esc(e.message) + '</p>';
      else toast('Hors ligne — données en cache', true);
    });
  }

  /* ---------- routeur (hash) ---------- */
  var renderedHash = '';
  function go(hash) { location.hash = hash; }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    renderedHash = location.hash;
    var p = h.split('/'); // ex: prep/mag/LYON
    window.scrollTo(0, 0);

    if (!state.pin) {
      if (p[0] === 'pin') return vuePin(p[1] || 'prep');
      return vueLanding();
    }
    switch (p[0]) {
      case '': case 'home': return state.role === 'mag' ? vueMagChoix() : vuePrepHome();
      case 'pin': return vuePin(p[1] || 'prep');
      case 'mag': return p[1] ? vueMagInventaire(p[1]) : vueMagChoix();
      case 'magdemande': return vueMagDemande(p[1]);
      case 'prep': return vuePrepHome();
      case 'prepmag': return vuePrepMagasin(p[1]);
      case 'demandes': return vueDemandes();
      case 'palettes': return p[1] === 'form' ? vuePaletteForm(p[2]) : vuePalettes();
      case 'hist': return vueHistorique(p[1] || 'LYON');
      default: return vueLanding();
    }
  }
  window.addEventListener('hashchange', route);

  function chrome(titre, backHash) {
    $topbar.classList.remove('is-hidden');
    $title.textContent = titre;
    $back.classList.toggle('is-hidden', !backHash);
    $back.onclick = backHash ? function () { go(backHash); } : null;
  }
  $logout.onclick = function () {
    localStorage.removeItem('bs_pin');
    localStorage.removeItem('bs_role');
    state.pin = ''; state.role = '';
    go('');
  };

  /* ============================================================
     VUES
     ============================================================ */

  /* ----- Accueil (choix du rôle) ----- */
  function vueLanding() {
    $topbar.classList.add('is-hidden');
    $app.innerHTML =
      '<div class="hero">' +
      '  <div class="hero_title">BUBBLE STOCK</div>' +
      '  <div class="hero_sub">Gestion des stocks</div>' +
      '</div>' +
      '<button class="card" id="c-prep"><div class="card_title">PREPARATEUR</div><div class="card_sub">Préparation des expéditions entrepôt</div></button>' +
      '<button class="card is-vert" id="c-mag"><div class="card_title">MAGASIN</div><div class="card_sub">Inventaire magasin</div></button>';
    document.getElementById('c-prep').onclick = function () { go('pin/prep'); };
    document.getElementById('c-mag').onclick = function () { go('pin/mag'); };
  }

  /* ----- Pavé PIN ----- */
  function vuePin(role) {
    chrome(role === 'mag' ? 'Magasin' : 'Préparateur', '');
    var saisie = '';
    $app.innerHTML =
      '<div class="pin">' +
      '  <div class="pin_dots" id="pin-dots"></div>' +
      '  <div class="pin_pad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(function (k) {
        return k === '' ? '<span></span>' : '<button class="pin_key" data-k="' + k + '">' + k + '</button>';
      }).join('') +
      '  </div>' +
      '  <div class="pin_error" id="pin-err"></div>' +
      '</div>';
    var $dots = document.getElementById('pin-dots');
    var $err = document.getElementById('pin-err');
    function maj() { $dots.textContent = '●'.repeat(saisie.length) || ' '; }
    maj();
    $app.querySelectorAll('.pin_key').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-k');
        if (k === '⌫') { saisie = saisie.slice(0, -1); maj(); return; }
        if (saisie.length >= 4) return;
        saisie += k; maj();
        if (saisie.length === 4) {
          api({ fn: 'login', pin: saisie }).then(function (j) {
            state.pin = saisie; state.role = j.role;
            localStorage.setItem('bs_pin', saisie);
            localStorage.setItem('bs_role', j.role);
            go(j.role === 'mag' ? 'mag' : 'prep');
          }).catch(function () {
            saisie = ''; maj();
            $err.textContent = 'Code incorrect';
            setTimeout(function () { $err.textContent = ''; }, 1800);
          });
        }
      };
    });
  }

  /* ============ CÔTÉ MAGASIN ============ */

  function vueMagChoix() {
    chrome('Mon magasin', '');
    $app.innerHTML = CFG.MAGASINS.map(function (m) {
      return '<button class="card is-vert" data-m="' + m + '"><div class="card_title">' + m + '</div></button>';
    }).join('');
    $app.querySelectorAll('.card').forEach(function (c) {
      c.onclick = function () { go('mag/' + c.getAttribute('data-m')); };
    });
  }

  function vueMagInventaire(mag) {
    chrome(mag, 'mag');
    cached('data_' + mag, function () {
      return api({ fn: 'data', m: mag }).then(function (j) { return j.data; });
    }, function (data) {
      var parCat = {};
      data.products.forEach(function (pr) { (parCat[pr.cat] = parCat[pr.cat] || []).push(pr); });
      var h = '<div class="subnav">' +
        '<span class="subnav_lien is-actif">Inventaire</span>' +
        '<button class="subnav_lien" id="nav-dem">Demande d\'envoi</button>' +
        '</div>';
      Object.keys(parCat).forEach(function (cat) {
        h += '<div class="section_title">' + esc(cat) + '</div>';
        parCat[cat].forEach(function (pr) {
          var cls = pr.statut === 'RUPTURE' ? 'is-rupture' : pr.statut === 'BAS' ? 'is-bas' : 'is-ok';
          h += '<div class="prod">' +
            '<div class="prod_info">' +
            '  <div class="prod_nom">' + esc(pr.produit) + '</div>' +
            '  <div class="prod_detail">Stock ' + pr.stock + ' / ' + pr.max +
            (pr.livraison ? ' &nbsp;·&nbsp; Livraison +' + pr.livraison : '') + '</div>' +
            '  <div class="jauge"><div class="jauge_barre ' + cls + '" style="width:' + Math.min(pr.pct, 100) + '%"></div></div>' +
            '</div>' +
            '<span class="prod_statut ' + cls + '">' + pr.statut + '</span>' +
            '<input class="prod_input" type="number" inputmode="numeric" placeholder="RÉEL" value="' + (pr.reel == null ? '' : esc(pr.reel)) + '" data-id="' + esc(pr.id) + '">' +
            '</div>';
        });
      });
      $app.innerHTML = h;
      document.getElementById('nav-dem').onclick = function () { go('magdemande/' + mag); };
      // Sauvegarde du RÉEL au changement (instantané, champ par champ)
      $app.querySelectorAll('.prod_input').forEach(function (inp) {
        inp.onchange = function () {
          var val = inp.value;
          api({ fn: 'saveReel', m: mag, id: inp.getAttribute('data-id'), value: val })
            .then(function () { toast('RÉEL enregistré'); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    });
  }

  function vueMagDemande(mag) {
    chrome('Demande — ' + mag, 'mag/' + mag);
    $app.innerHTML =
      '<div class="champ"><label class="champ_label">Note (demande générale)</label>' +
      '<textarea class="champ_textarea" id="dem-note" placeholder="Ex : besoin de réassort sirops"></textarea></div>' +
      '<button class="btn" id="dem-send">Envoyer la demande</button>';
    document.getElementById('dem-send').onclick = function () {
      var note = document.getElementById('dem-note').value.trim();
      api({ fn: 'action', action: 'demande_envoi', m: mag, note: note })
        .then(function () { toast('Demande envoyée'); go('mag/' + mag); })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  /* ============ CÔTÉ PRÉPARATEUR ============ */

  function vuePrepHome() {
    chrome('Préparateur', '');
    cached('demandes', function () {
      return api({ fn: 'demandes' }).then(function (j) { return j.demandes; });
    }, function (dem) {
      var nb = 0;
      Object.keys(dem || {}).forEach(function (k) { nb += dem[k].length; });
      var h = CFG.MAGASINS.map(function (m) {
        var n = (dem && dem[m]) ? dem[m].length : 0;
        return '<button class="card" data-m="' + m + '"><div class="card_title">' + m +
          (n ? '<span class="card_badge">' + n + '</span>' : '') + '</div><div class="card_sub">Préparer une expédition</div></button>';
      }).join('');
      h += '<button class="card is-vert" id="c-demandes"><div class="card_title">DEMANDES' +
        (nb ? '<span class="card_badge">' + nb + '</span>' : '') + '</div><div class="card_sub">Demandes des magasins</div></button>';
      h += '<button class="card" id="c-palettes"><div class="card_title">PALETTES</div><div class="card_sub">Suivi des palettes</div></button>';
      h += '<button class="card" id="c-hist"><div class="card_title">HISTORIQUE</div><div class="card_sub">Expéditions passées</div></button>';
      $app.innerHTML = h;
      $app.querySelectorAll('.card[data-m]').forEach(function (c) {
        c.onclick = function () { go('prepmag/' + c.getAttribute('data-m')); };
      });
      document.getElementById('c-demandes').onclick = function () { go('demandes'); };
      document.getElementById('c-palettes').onclick = function () { go('palettes'); };
      document.getElementById('c-hist').onclick = function () { go('hist/LYON'); };
    });
  }

  /* ----- Préparation d'une expédition ----- */
  function vuePrepMagasin(mag) {
    chrome('Préparer — ' + mag, 'prep');
    cached('data_' + mag, function () {
      return api({ fn: 'data', m: mag }).then(function (j) { return j.data; });
    }, function (data) {
      var parCat = {};
      data.products.forEach(function (pr) { (parCat[pr.cat] = parCat[pr.cat] || []).push(pr); });
      var h = '';
      Object.keys(parCat).forEach(function (cat) {
        h += '<div class="section_title">' + esc(cat) + '</div>';
        parCat[cat].forEach(function (pr) {
          var cls = pr.statut === 'RUPTURE' ? 'is-rupture' : pr.statut === 'BAS' ? 'is-bas' : 'is-ok';
          var manque = Math.max(0, pr.max - pr.stock);
          h += '<div class="prod">' +
            '<div class="prod_info">' +
            '  <div class="prod_nom">' + esc(pr.produit) + '</div>' +
            '  <div class="prod_detail">Stock ' + pr.stock + ' / ' + pr.max + ' &nbsp;·&nbsp; manque ' + manque + '</div>' +
            '  <div class="jauge"><div class="jauge_barre ' + cls + '" style="width:' + Math.min(pr.pct, 100) + '%"></div></div>' +
            '</div>' +
            '<input class="prod_input" type="number" inputmode="numeric" placeholder="0" data-id="' + esc(pr.id) + '">' +
            '</div>';
        });
      });
      h += '<div class="btn-flottant"><button class="btn is-vert" id="btn-ship">Valider l\'expédition</button>' +
        '<button class="btn is-secondaire" id="btn-draft">Sauvegarder la progression</button></div>';
      $app.innerHTML = h;

      // Pré-remplit avec le brouillon éventuel (format serveur : {items:{'r_<id>': val}, ts})
      api({ fn: 'draft', m: mag }).then(function (j) {
        if (!j.draft || !j.draft.items) return;
        var items = j.draft.items;
        Object.keys(items).forEach(function (k) {
          var id = k.indexOf('r_') === 0 ? k.substring(2) : k;
          var inp = $app.querySelector('.prod_input[data-id="' + CSS.escape(id) + '"]');
          if (inp) inp.value = items[k];
        });
      }).catch(function () {});

      function champs() {
        var o = {};
        $app.querySelectorAll('.prod_input').forEach(function (inp) {
          if (inp.value !== '' && Number(inp.value) > 0) o['r_' + inp.getAttribute('data-id')] = inp.value;
        });
        return o;
      }
      document.getElementById('btn-ship').onclick = function () {
        var o = champs();
        if (!Object.keys(o).length) return toast('Aucune quantité saisie', true);
        if (!confirm('Valider l\'expédition vers ' + mag + ' ?')) return;
        o.fn = 'action'; o.action = 'ship'; o.m = mag;
        api(o).then(function () {
          localStorage.removeItem('bs_c_data_' + mag);
          toast('Expédition validée'); go('prep');
        }).catch(function (e) { toast(e.message, true); });
      };
      document.getElementById('btn-draft').onclick = function () {
        var o = champs();
        o.fn = 'action'; o.action = 'save_progress'; o.m = mag;
        api(o).then(function () { toast('Progression sauvegardée'); })
          .catch(function (e) { toast(e.message, true); });
      };
    });
  }

  /* ----- Demandes des magasins ----- */
  function vueDemandes() {
    chrome('Demandes', 'prep');
    cached('demandes', function () {
      return api({ fn: 'demandes' }).then(function (j) { return j.demandes; });
    }, function (dem) {
      var h = '';
      var vide = true;
      Object.keys(dem || {}).forEach(function (m) {
        dem[m].forEach(function (d) {
          vide = false;
          var date = d.ts ? new Date(d.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
          h += '<div class="ligne">' +
            '<div class="ligne_titre">' + esc(m) + ' — ' + esc(d.type) + '</div>' +
            '<div class="ligne_sub">' + esc(date) + (d.note ? ' · ' + esc(d.note) : '') + '</div>' +
            (d.items && d.items.length ? '<div class="ligne_sub">' + d.items.map(function (it) { return esc(it.id || it.produit || '') + ' ×' + esc(it.q || it.qte || '?'); }).join(', ') + '</div>' : '') +
            '<div class="ligne_actions">' +
            '<button class="btn is-vert" data-act="ship" data-m="' + esc(m) + '" data-did="' + d.row + '">Expédier</button>' +
            '<button class="btn is-danger" data-act="del" data-m="' + esc(m) + '" data-did="' + d.row + '">Supprimer</button>' +
            '</div></div>';
        });
      });
      $app.innerHTML = vide ? '<p class="vide">Aucune demande en attente</p>' : h;
      $app.querySelectorAll('button[data-act]').forEach(function (b) {
        b.onclick = function () {
          var act = b.getAttribute('data-act') === 'ship' ? 'ship_demande' : 'delete_demande';
          if (act === 'delete_demande' && !confirm('Supprimer cette demande ?')) return;
          api({ fn: 'action', action: act, m: b.getAttribute('data-m'), did: b.getAttribute('data-did') })
            .then(function () { localStorage.removeItem('bs_c_demandes'); toast('OK'); route(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    });
  }

  /* ----- Palettes ----- */
  function vuePalettes() {
    chrome('Palettes', 'prep');
    cached('palettes', function () {
      return api({ fn: 'palettes' }).then(function (j) { return j.palettes; });
    }, function (pals) {
      var actives = (pals || []).filter(function (p) { return p.isActive; });
      var h = '<button class="btn" id="btn-add">+ Ajouter une palette</button>';
      if (!actives.length) h += '<p class="vide">Aucune palette active</p>';
      actives.forEach(function (p) {
        var date = p.tsIn ? new Date(p.tsIn).toLocaleDateString('fr-FR') : '';
        h += '<div class="ligne">' +
          '<div class="ligne_titre">N° ' + esc(p.numero) + (p.nom ? ' — ' + esc(p.nom) : '') + '</div>' +
          '<div class="ligne_sub">Entrée ' + esc(date) + (p.hauteur ? ' · H ' + esc(p.hauteur) : '') + (p.note ? ' · ' + esc(p.note) : '') + '</div>' +
          '<div class="ligne_actions">' +
          '<button class="btn is-secondaire" data-edit="' + p.row + '">Modifier</button>' +
          '<button class="btn is-vert" data-out="' + p.row + '">Sortie</button>' +
          '</div></div>';
      });
      $app.innerHTML = h;
      document.getElementById('btn-add').onclick = function () { go('palettes/form'); };
      $app.querySelectorAll('button[data-edit]').forEach(function (b) {
        b.onclick = function () { go('palettes/form/' + b.getAttribute('data-edit')); };
      });
      $app.querySelectorAll('button[data-out]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Sortir cette palette ?')) return;
          api({ fn: 'action', action: 'remove_palette', row: b.getAttribute('data-out') })
            .then(function () { localStorage.removeItem('bs_c_palettes'); toast('Palette sortie'); route(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    });
  }

  function vuePaletteForm(row) {
    chrome(row ? 'Modifier la palette' : 'Nouvelle palette', 'palettes');
    var pal = null;
    if (row) {
      var c = cacheGet('palettes');
      if (c) pal = (c.data || []).filter(function (p) { return String(p.row) === String(row); })[0];
    }
    var today = new Date().toISOString().slice(0, 10);
    $app.innerHTML =
      '<div class="champ"><label class="champ_label">Numéro</label><input class="champ_input" id="f-numero" value="' + esc(pal ? pal.numero : '') + '"></div>' +
      '<div class="champ"><label class="champ_label">Nom</label><input class="champ_input" id="f-nom" value="' + esc(pal ? pal.nom : '') + '"></div>' +
      '<div class="champ"><label class="champ_label">Hauteur</label><input class="champ_input" id="f-hauteur" value="' + esc(pal ? pal.hauteur : '') + '"></div>' +
      '<div class="champ"><label class="champ_label">Date d\'entrée</label><input class="champ_input" id="f-date" type="date" value="' + (pal && pal.tsIn ? new Date(pal.tsIn).toISOString().slice(0, 10) : today) + '"></div>' +
      '<div class="champ"><label class="champ_label">Note</label><textarea class="champ_textarea" id="f-note">' + esc(pal ? pal.note : '') + '</textarea></div>' +
      '<button class="btn" id="f-save">' + (row ? 'Enregistrer' : 'Ajouter') + '</button>';
    document.getElementById('f-save').onclick = function () {
      var body = {
        fn: 'action',
        action: row ? 'edit_palette' : 'add_palette',
        numero: document.getElementById('f-numero').value,
        nom: document.getElementById('f-nom').value,
        hauteur: document.getElementById('f-hauteur').value,
        note: document.getElementById('f-note').value,
        date_in: document.getElementById('f-date').value
      };
      if (row) body.row = row;
      api(body).then(function () {
        localStorage.removeItem('bs_c_palettes');
        toast(row ? 'Palette modifiée' : 'Palette ajoutée');
        go('palettes');
      }).catch(function (e) { toast(e.message, true); });
    };
  }

  /* ----- Historique ----- */
  function vueHistorique(mag) {
    chrome('Historique', 'prep');
    var nav = '<div class="subnav">' + CFG.MAGASINS.map(function (m) {
      return '<button class="subnav_lien' + (m === mag ? ' is-actif' : '') + '" data-m="' + m + '">' + m + '</button>';
    }).join('') + '</div>';
    cached('hist_' + mag, function () {
      return api({ fn: 'hist', m: mag, limit: 30 }).then(function (j) { return j.expeditions; });
    }, function (exps) {
      var h = nav;
      if (!exps || !exps.length) h += '<p class="vide">Aucune expédition</p>';
      (exps || []).forEach(function (x) {
        var date = x.date ? new Date(x.date).toLocaleDateString('fr-FR') : esc(x.dateStr || '');
        var nb = x.items ? x.items.length : (x.nb || '');
        h += '<div class="ligne">' +
          '<div class="ligne_titre">' + date + '</div>' +
          '<div class="ligne_sub">' + (nb ? nb + ' produits' : '') + '</div>' +
          '</div>';
      });
      $app.innerHTML = h;
      $app.querySelectorAll('.subnav_lien').forEach(function (b) {
        b.onclick = function () { go('hist/' + b.getAttribute('data-m')); };
      });
    });
  }

  /* ---------- démarrage ---------- */
  route();
})();
