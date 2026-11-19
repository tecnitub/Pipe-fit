// Fenêtre « Isométries de fabrication » : choix du paramètre spool, des spools à générer, de la mise en page
// (cartouche, orientation, représentation), des étiquettes et des exports.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using PipeFit.Isometries.Core;

namespace PipeFit.Isometries.Revit
{
    public enum ActionFenetre { Annuler, Generer, SelectionnerSansSpool }

    sealed class DonneesFenetre
    {
        public List<string> Parametres = new List<string>();
        public List<string> Cartouches = new List<string>();
        public List<string> EtiquettesTube = new List<string>();
        public List<string> EtiquettesRaccord = new List<string>();
        public List<string> EtiquettesAccessoire = new List<string>();
        public List<string> ParametresRepere = new List<string>();
        /// <summary>Pour un paramètre : nombre d'éléments par spool et nombre d'éléments sans numéro.</summary>
        public Func<string, (Dictionary<string, int> spools, int sansSpool)> Compter;
        public HashSet<string> Preselection = new HashSet<string>();
        /// <summary>Types d'accessoires de canalisation du projet : (famille, type).</summary>
        public List<(string Famille, string Type)> TypesAccessoires = new List<(string, string)>();
    }

    sealed class Fenetre : Form
    {
        public const string AucuneEtiquette = "(aucune étiquette)";
        const string CadreA3 = "(aucun – cadre A3 Pipe-Fit)";
        const string Marque = "Marque (paramètre Revit)";

        public ActionFenetre Action = ActionFenetre.Annuler;
        readonly Reglages r;
        readonly DonneesFenetre d;

        readonly ComboBox cbParam = Liste(), cbCartouche = Liste(), cbOrientation = Liste(), cbRepr = Liste();
        readonly ComboBox cbTagTube = Liste(), cbTagRaccord = Liste(), cbTagAccessoire = Liste(), cbParamRepere = Liste();
        readonly TextBox tbFiltre = new TextBox(), tbPrefixe = new TextBox(), tbDossier = new TextBox();
        readonly CheckedListBox lstSpools = new CheckedListBox { CheckOnClick = true, IntegralHeight = false };
        readonly CheckBox ckRemplacer = Case("Remplacer les isométries déjà générées"), ckRepere = Case("Écrire le repère dans :"),
            ckSoudures = Case("Numéros de soudure (S1…) et de raccordement (R1…) sur la vue"),
            ckCotes = Case("Cotes d'axe en axe et d'axe à bride (ou à bout de tube)"),
            ckSymboles = Case("Robinetterie en symboles normalisés (papillon, réglage, clapet, compensateur…)"),
            ckFeuille = Case("Repères et n° de soudure placés sans chevauchement (sinon étiquettes Revit ci-dessus)"),
            ckLegende = Case("Feuille de légende de tous les symboles (ISO-LÉGENDE)"),
            ckPdf = Case("PDF (une feuille par spool)"), ckPcf = Case("PCF (Isogen, Spoolgen…)"), ckCsv = Case("CSV nomenclature, soudures et cotes (Pipe-Fit)");
        readonly NumericUpDown nudSurl = new NumericUpDown { Minimum = 0, Maximum = 2000, Increment = 50 };
        readonly Label lblInfo = new Label { AutoSize = false, ForeColor = Color.DarkRed }, lblCompte = new Label { AutoSize = false };
        readonly LinkLabel lnkSansSpool = new LinkLabel { Text = "Sélectionner ces éléments dans le modèle", AutoSize = true, Visible = false };

        Dictionary<string, int> spools = new Dictionary<string, int>();
        readonly HashSet<string> coches = new HashSet<string>();
        bool remplissage;

        public Fenetre(Reglages r, DonneesFenetre d)
        {
            this.r = r; this.d = d;
            Text = "Pipe-Fit – Isométries de fabrication par spool";
            Font = new Font("Segoe UI", 9f);
            Ergonomie.Preparer(this);
            FormBorderStyle = FormBorderStyle.Sizable;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(900, 740);
            MinimumSize = new Size(840, 700);

            // ----- Colonne de gauche : spools -----
            // Panneaux à leur taille définitive avant d'y placer les contrôles (sinon les ancrages en bas sont faussés)
            var gauche = new Panel { Dock = DockStyle.Left, Size = new Size(330, ClientSize.Height - 50) };
            var lblP = new Label { Text = "Paramètre du numéro de spool :", AutoSize = true, Location = new Point(12, 12) };
            cbParam.SetBounds(12, 32, 306, 24);
            cbParam.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            var lblS = new Label { Text = "Spools à générer :", AutoSize = true, Location = new Point(12, 66) };
            tbFiltre.SetBounds(12, 86, 306, 24);
            tbFiltre.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            SetCue(tbFiltre, "Filtrer (ex. SP-1, EG-101…)");
            lstSpools.SetBounds(12, 114, 306, 440);
            lstSpools.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            var btTout = new Button { Text = "Tout", Anchor = AnchorStyles.Bottom | AnchorStyles.Left };
            btTout.SetBounds(12, 562, 70, 26);
            var btAucun = new Button { Text = "Aucun", Anchor = AnchorStyles.Bottom | AnchorStyles.Left };
            btAucun.SetBounds(88, 562, 70, 26);
            lblCompte.SetBounds(166, 566, 160, 20);
            lblCompte.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            lblInfo.SetBounds(12, 594, 310, 32);
            lblInfo.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            lnkSansSpool.Location = new Point(12, 628);
            lnkSansSpool.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
            gauche.Controls.AddRange(new Control[] { lblP, cbParam, lblS, tbFiltre, lstSpools, btTout, btAucun, lblCompte, lblInfo, lnkSansSpool });

            // ----- Colonne de droite : réglages -----
            var droite = new Panel { Dock = DockStyle.Fill, Size = new Size(ClientSize.Width - 330, ClientSize.Height - 50), AutoScroll = true };
            int y = 12;
            var gFeuille = Groupe("Feuille", ref y, 150);
            Ligne(gFeuille, "Cartouche :", cbCartouche, 24);
            Ligne(gFeuille, "N° de feuille :", tbPrefixe, 54, 120);
            gFeuille.Controls.Add(new Label { Text = "+ numéro de spool", AutoSize = true, Location = new Point(262, 57), ForeColor = SystemColors.GrayText });
            Ligne(gFeuille, "Orientation :", cbOrientation, 84);
            Ligne(gFeuille, "Représentation :", cbRepr, 114);

            var gAnnot = Groupe("Repères, étiquettes et cotes", ref y, 314);
            Ligne(gAnnot, "Canalisations :", cbTagTube, 24);
            Ligne(gAnnot, "Raccords :", cbTagRaccord, 54);
            Ligne(gAnnot, "Accessoires :", cbTagAccessoire, 84);
            ckRepere.SetBounds(12, 116, 150, 22);
            cbParamRepere.SetBounds(166, 114, 330, 24);
            cbParamRepere.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            ckSoudures.SetBounds(12, 146, 480, 22);
            ckCotes.SetBounds(12, 172, 480, 22);
            gAnnot.Controls.Add(new Label { Text = "Surlongueur aux soudures chantier :", AutoSize = true, Location = new Point(12, 205) });
            nudSurl.SetBounds(226, 202, 70, 24);
            gAnnot.Controls.Add(new Label { Text = "mm à recouper sur place (0 = aucune)", AutoSize = true, Location = new Point(300, 205), ForeColor = SystemColors.GrayText });
            ckSymboles.SetBounds(12, 230, 400, 22);
            var btSymboles = new Button { Text = "Symboles…", Anchor = AnchorStyles.Top | AnchorStyles.Right };
            btSymboles.SetBounds(416, 228, 96, 26);
            btSymboles.Click += (s, e) =>
            {
                using (var fs = new FenetreSymboles(d.TypesAccessoires)) fs.ShowDialog(this);
            };
            gAnnot.Controls.Add(btSymboles);
            ckFeuille.SetBounds(12, 256, 500, 22);
            ckLegende.SetBounds(12, 282, 500, 22);
            gAnnot.Controls.Add(ckLegende);
            gAnnot.Controls.AddRange(new Control[] { ckRepere, cbParamRepere, ckSoudures, ckCotes, nudSurl, ckSymboles, ckFeuille });

            var gExport = Groupe("Exports", ref y, 120);
            ckPdf.SetBounds(12, 22, 240, 22); ckPcf.SetBounds(260, 22, 240, 22); ckCsv.SetBounds(12, 48, 300, 22);
            gExport.Controls.AddRange(new Control[] { ckPdf, ckPcf, ckCsv });
            Ligne(gExport, "Dossier :", tbDossier, 80, 282);
            var btDossier = new Button { Text = "Parcourir…", Anchor = AnchorStyles.Top | AnchorStyles.Right };
            btDossier.SetBounds(424, 79, 80, 26);
            gExport.Controls.Add(btDossier);

            ckRemplacer.SetBounds(12, y + 2, 400, 22);
            droite.Controls.Add(ckRemplacer);

            // ----- Boutons -----
            var bas = new Panel { Dock = DockStyle.Bottom, Size = new Size(ClientSize.Width, 50) };
            var btGenerer = new Button { Text = "Générer les isométries", Anchor = AnchorStyles.Right | AnchorStyles.Bottom };
            btGenerer.SetBounds(ClientSize.Width - 300, 10, 180, 30);
            var btAnnuler = new Button { Text = "Annuler", Anchor = AnchorStyles.Right | AnchorStyles.Bottom, DialogResult = DialogResult.Cancel };
            btAnnuler.SetBounds(ClientSize.Width - 110, 10, 96, 30);
            var lblAide = new Label
            {
                Text = "Une feuille par spool : vue 3D isolée et verrouillée, nomenclature repérée, débit, soudures.",
                AutoSize = false, ForeColor = SystemColors.GrayText, Anchor = AnchorStyles.Left | AnchorStyles.Bottom | AnchorStyles.Right,
            };
            lblAide.SetBounds(12, 16, ClientSize.Width - 330, 20);
            bas.Controls.AddRange(new Control[] { lblAide, btGenerer, btAnnuler });

            Controls.Add(droite);
            Controls.Add(gauche);
            Controls.Add(bas);
            AcceptButton = btGenerer;
            CancelButton = btAnnuler;

            void Groupe2(GroupBox g) => droite.Controls.Add(g);
            Groupe2(gFeuille); Groupe2(gAnnot); Groupe2(gExport);

            // ----- Valeurs -----
            cbParam.Items.AddRange(d.Parametres.Cast<object>().ToArray());
            cbCartouche.Items.Add(CadreA3); cbCartouche.Items.AddRange(d.Cartouches.Cast<object>().ToArray());
            cbOrientation.Items.AddRange(new object[] { "Isométrique sud-est", "Isométrique sud-ouest", "Isométrique nord-est", "Isométrique nord-ouest" });
            cbRepr.Items.AddRange(new object[] { "Unifilaire (niveau de détail Faible)", "Détaillée (niveau de détail Élevé)" });
            Remplir(cbTagTube, d.EtiquettesTube); Remplir(cbTagRaccord, d.EtiquettesRaccord); Remplir(cbTagAccessoire, d.EtiquettesAccessoire);
            cbParamRepere.Items.Add(Marque); cbParamRepere.Items.AddRange(d.ParametresRepere.Cast<object>().ToArray());

            Choisir(cbParam, r.ParametreSpool);
            Choisir(cbCartouche, r.Cartouche == "" ? CadreA3 : r.Cartouche);
            cbOrientation.SelectedIndex = (int)r.Orientation;
            cbRepr.SelectedIndex = r.Unifilaire ? 0 : 1;
            Choisir(cbTagTube, r.EtiquetteTube); Choisir(cbTagRaccord, r.EtiquetteRaccord); Choisir(cbTagAccessoire, r.EtiquetteAccessoire);
            Choisir(cbParamRepere, r.ParametreRepere == "" ? Marque : r.ParametreRepere);
            tbPrefixe.Text = r.PrefixeFeuille;
            tbDossier.Text = r.Dossier;
            ckRemplacer.Checked = r.Remplacer; ckRepere.Checked = r.EcrireRepere; ckSoudures.Checked = r.NumerosSoudure; ckCotes.Checked = r.Cotation; ckSymboles.Checked = r.SymbolesRobinetterie; ckFeuille.Checked = r.RepereFeuille; ckLegende.Checked = r.FeuilleLegende;
            nudSurl.Value = (decimal)Math.Max(0, Math.Min(2000, r.SurlongueurMm));
            ckPdf.Checked = r.ExportPdf; ckPcf.Checked = r.ExportPcf; ckCsv.Checked = r.ExportCsv;
            foreach (var s in d.Preselection) coches.Add(s);

            // ----- Événements -----
            cbParam.SelectedIndexChanged += (s, e) => ChargerSpools(true);
            tbFiltre.TextChanged += (s, e) => AfficherSpools();
            lstSpools.ItemCheck += (s, e) =>
            {
                if (remplissage) return;
                var nom = Nom(lstSpools.Items[e.Index]);
                if (e.NewValue == CheckState.Checked) coches.Add(nom); else coches.Remove(nom);
                BeginInvoke(new Action(MajCompte));
            };
            btTout.Click += (s, e) => { foreach (var o in lstSpools.Items) coches.Add(Nom(o)); AfficherSpools(); };
            btAucun.Click += (s, e) => { foreach (var o in lstSpools.Items) coches.Remove(Nom(o)); AfficherSpools(); };
            ckRepere.CheckedChanged += (s, e) => cbParamRepere.Enabled = ckRepere.Checked;
            EventHandler exports = (s, e) => { tbDossier.Enabled = btDossier.Enabled = ckPdf.Checked || ckPcf.Checked || ckCsv.Checked; };
            ckPdf.CheckedChanged += exports; ckPcf.CheckedChanged += exports; ckCsv.CheckedChanged += exports;
            exports(null, EventArgs.Empty);
            cbParamRepere.Enabled = ckRepere.Checked;
            btDossier.Click += (s, e) =>
            {
                using (var dlg = new FolderBrowserDialog { Description = "Dossier des exports (PDF, PCF, CSV)", SelectedPath = tbDossier.Text })
                    if (dlg.ShowDialog(this) == DialogResult.OK) tbDossier.Text = dlg.SelectedPath;
            };
            lnkSansSpool.LinkClicked += (s, e) => { Lire(); Action = ActionFenetre.SelectionnerSansSpool; DialogResult = DialogResult.OK; };
            btGenerer.Click += (s, e) => Valider();

            ChargerSpools(false);
        }

        // ---------- Spools ----------

        void ChargerSpools(bool changementParametre)
        {
            var param = cbParam.SelectedItem as string ?? "";
            var (liste, sans) = param == "" ? (new Dictionary<string, int>(), 0) : d.Compter(param);
            spools = liste;
            // Par défaut tous les spools sont cochés ; à l'ouverture, ceux des éléments sélectionnés s'il y en a
            if (changementParametre || !coches.Any(spools.ContainsKey))
            {
                coches.Clear();
                foreach (var s in spools.Keys) coches.Add(s);
            }
            lblInfo.Text = param == ""
                ? "Choisissez le paramètre qui contient le numéro de spool."
                : spools.Count == 0 ? "Aucun spool numéroté dans « " + param + " ». Le plus simple : sélectionnez la tuyauterie avec Ctrl, puis Spools › Numéroter › « Générer un spool »."
                : sans > 0 ? sans + " élément(s) de tuyauterie sans numéro de spool (ignorés)." : "";
            lnkSansSpool.Visible = param != "" && sans > 0;
            AfficherSpools();
        }

        void AfficherSpools()
        {
            remplissage = true;
            lstSpools.BeginUpdate();
            lstSpools.Items.Clear();
            var f = AnalyseSpool.Normaliser(tbFiltre.Text);
            foreach (var s in spools.Keys.OrderBy(k => k, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)))
            {
                if (f != "" && !AnalyseSpool.Normaliser(s).Contains(f)) continue;
                lstSpools.Items.Add(s + "   (" + spools[s] + " élément" + (spools[s] > 1 ? "s" : "") + ")", coches.Contains(s));
            }
            lstSpools.EndUpdate();
            remplissage = false;
            MajCompte();
        }

        void MajCompte()
        {
            var n = coches.Count(spools.ContainsKey);
            lblCompte.Text = n + " / " + spools.Count + " spool" + (spools.Count > 1 ? "s" : "");
        }

        static string Nom(object item)
        {
            var s = item.ToString();
            var i = s.LastIndexOf("   (", StringComparison.Ordinal);
            return i < 0 ? s : s.Substring(0, i);
        }

        // ---------- Validation ----------

        void Lire()
        {
            r.ParametreSpool = cbParam.SelectedItem as string ?? "";
            r.Spools = coches.Where(spools.ContainsKey).OrderBy(k => k, Comparer<string>.Create(AnalyseSpool.ComparerNaturel)).ToList();
            var cart = cbCartouche.SelectedItem as string ?? CadreA3;
            r.Cartouche = cart == CadreA3 ? "" : cart;
            r.PrefixeFeuille = tbPrefixe.Text.Trim();
            r.Orientation = (Orientation)Math.Max(0, cbOrientation.SelectedIndex);
            r.Unifilaire = cbRepr.SelectedIndex != 1;
            r.EtiquetteTube = cbTagTube.SelectedItem as string ?? AucuneEtiquette;
            r.EtiquetteRaccord = cbTagRaccord.SelectedItem as string ?? AucuneEtiquette;
            r.EtiquetteAccessoire = cbTagAccessoire.SelectedItem as string ?? AucuneEtiquette;
            r.EcrireRepere = ckRepere.Checked;
            var rep = cbParamRepere.SelectedItem as string ?? Marque;
            r.ParametreRepere = rep == Marque ? "" : rep;
            r.NumerosSoudure = ckSoudures.Checked;
            r.Cotation = ckCotes.Checked;
            r.SymbolesRobinetterie = ckSymboles.Checked;
            r.RepereFeuille = ckFeuille.Checked;
            r.FeuilleLegende = ckLegende.Checked;
            r.SurlongueurMm = (double)nudSurl.Value;
            r.Remplacer = ckRemplacer.Checked;
            r.ExportPdf = ckPdf.Checked; r.ExportPcf = ckPcf.Checked; r.ExportCsv = ckCsv.Checked;
            r.Dossier = tbDossier.Text.Trim();
        }

        void Valider()
        {
            Lire();
            if (r.Spools.Count == 0) { MessageBox.Show(this, "Cochez au moins un spool.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
            if ((r.ExportPdf || r.ExportPcf || r.ExportCsv) && r.Dossier == "")
            {
                MessageBox.Show(this, "Choisissez le dossier des exports, ou décochez les exports.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            Action = ActionFenetre.Generer;
            DialogResult = DialogResult.OK;
        }

        // ---------- Outils ----------

        static ComboBox Liste() => new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList };
        static CheckBox Case(string t) => new CheckBox { Text = t, AutoSize = false };

        static void Remplir(ComboBox cb, List<string> valeurs)
        {
            cb.Items.Add(AucuneEtiquette);
            cb.Items.AddRange(valeurs.Cast<object>().ToArray());
        }

        static void Choisir(ComboBox cb, string valeur)
        {
            var i = valeur == null ? -1 : cb.Items.IndexOf(valeur);
            // Étiquettes : première étiquette chargée dans le projet par défaut
            if (i < 0 && cb.Items.Count > 1 && cb.Items[0] as string == AucuneEtiquette && valeur != AucuneEtiquette) i = 1;
            cb.SelectedIndex = i >= 0 ? i : cb.Items.Count > 0 ? 0 : -1;
        }

        GroupBox Groupe(string titre, ref int y, int h)
        {
            var g = new GroupBox { Text = titre, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            g.SetBounds(6, y, 520, h);
            y += h + 10;
            return g;
        }

        static void Ligne(GroupBox g, string libelle, Control c, int y, int largeur = 0)
        {
            g.Controls.Add(new Label { Text = libelle, AutoSize = false, Location = new Point(12, y + 3), Size = new Size(120, 20) });
            c.SetBounds(136, y, largeur > 0 ? largeur : 370, 24);
            if (largeur == 0) c.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            g.Controls.Add(c);
        }

        static void SetCue(TextBox tb, string texte)
        {
            tb.HandleCreated += (s, e) => SendMessage(tb.Handle, 0x1501, (IntPtr)1, texte);
        }

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
    }
}
