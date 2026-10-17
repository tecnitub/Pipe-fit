// Réglages par défaut de l'application DOE (identité TECNITUB) : partagés par le serveur et la démo.
const CONFIG_DEFAUT = {
  societe: { raison: 'TECNITUB SARL', activite: 'Chaudronnerie · Tuyauterie · Chauffage · Climatisation', adresse: "251 rue du Ruisseau d'Aumas, Z.A. Le Mas, 07430 Davezieux",
    tel: '04 75 32 42 31', siret: '331 721 647 00039', ape: '3320A', qualibat: '', email: '' },
  lieu: 'Davezieux', couleur: '#1F3864', logoFichierId: '', lotDefaut: '', disciplineDefaut: 'GÉNIE CLIMATIQUE / PLOMBERIE',
};
if (typeof module !== 'undefined') module.exports = CONFIG_DEFAUT;
