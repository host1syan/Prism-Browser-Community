# Prism Browser Community

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Português (Brasil)](README.pt-BR.md)

**[Français](README.fr.md)** | [Українська](README.uk.md) | [Español](README.es.md) | [Türkçe](README.tr.md) | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

Auteur : [DFarm](https://x.com/DFarm_club) · Site officiel : [prismbrowser.app](https://prismbrowser.app/)

Prism Browser est un gestionnaire local de profils de navigateur avec empreintes numériques, fondé sur un Chromium personnalisé. Chaque profil possède ses propres cookies, cache, données d’extensions, paramètres de proxy et configuration d’empreinte, afin de gérer plusieurs identités de navigation isolées.

Par défaut, les profils, cookies, identifiants de proxy et historiques restent sur l’appareil de l’utilisateur. L’édition Community est gratuite et ne limite pas le nombre de profils locaux.

## Maintenance du code source

Ce dépôt restera public pour l’apprentissage, l’examen du code et les compilations communautaires. Depuis `v0.3.17`, les fonctionnalités, corrections et évolutions du code du produit ne sont plus régulièrement synchronisées ici. La complexité croissante de l’application, des moteurs, des paquets multiplateformes et des fonctions Pro augmente le coût de maintenance et de test de plusieurs branches.

À titre exceptionnel, cette mise à jour reprend la localisation générale de la version 0.3.19 et traduit l’interface publique existante. Elle n’inclut ni les environnements d’exécution privés de Pro, ni les services de licence, ni les nouvelles fonctions Pro, ni la configuration privée de publication. Elle ne marque pas la reprise d’une synchronisation continue du code du produit.

Le code existant, les commits et les anciennes versions sont conservés. Consultez le [site officiel](https://prismbrowser.app/) et les [Releases](../../releases) pour les nouveautés, corrections et programmes d’installation.

## Langues

L’interface et le README sont disponibles en **13 langues** : chinois simplifié et traditionnel, anglais, russe, vietnamien, thaï, portugais du Brésil, français, ukrainien, espagnol, turc, japonais et hindi. Les liens en haut de page permettent de changer la langue du README.

- Au démarrage, la langue d’affichage principale du système est utilisée ; l’anglais sert de repli si elle est indisponible ou non prise en charge.
- Le sélecteur en haut à droite permet un changement immédiat. Le choix manuel est enregistré localement et reste prioritaire aux démarrages suivants.
- La langue de l’interface est indépendante de la langue et du fuseau horaire de l’empreinte du profil. Noms, notes, étiquettes et modifications non enregistrées sont conservés.
- Les traductions sont intégrées à l’application, sans service de traduction en ligne. Pour contribuer, consultez le [guide de localisation en chinois et anglais](docs/localization.md).

## Télécharger et démarrer

Téléchargez le paquet adapté depuis les [Releases](../../releases) : DMG ou ZIP pour macOS ; programme d’installation ou version Portable pour Windows. Les paquets publiés comprennent un moteur Chromium 144 avec empreintes numériques prêt à l’emploi. Il n’est pas nécessaire de compiler Chromium.

Si le système bloque une version non signée, confirmez son ouverture dans **Réglages Système → Confidentialité et sécurité** sur macOS, ou dans **Informations complémentaires → Exécuter quand même** de SmartScreen sur Windows. Téléchargez uniquement depuis les Releases de ce projet et comparez le SHA-256 avec la valeur publiée.

1. Ouvrez Prism Browser et créez un profil.
2. Saisissez son nom, puis choisissez le système, la langue, le fuseau horaire, l’écran et l’identité matérielle.
3. Utilisez une connexion directe sans proxy, ou renseignez protocole, hôte, port et identifiants, puis testez la connexion.
4. Enregistrez et ouvrez le profil. À la fermeture de la fenêtre, cookies, cache, favoris et données d’extensions restent conservés.

Chaque profil utilise un répertoire de données distinct. La duplication conserve les paramètres tout en créant une nouvelle identité et une nouvelle graine.

## Fonctionnalités

Tout s’exécute en local : aucun compte, abonnement ni activation. L’API d’automatisation locale, les tâches planifiées et le contrôle de l’IA locale via MCP font partie de la version gratuite, et le noyau d’empreintes est fourni avec l’application.

Community propose des profils locaux illimités, des données indépendantes, des proxies HTTP/HTTPS/SOCKS5 et une protection contre les fuites WebRTC. Il permet de configurer User-Agent, langue, fuseau horaire, écran, CPU, mémoire et GPU, avec des caractéristiques cohérentes pour Canvas, WebGL, Audio, DOMRect, polices, Speech et WebGPU.

Il inclut duplication, groupes, étiquettes, favoris, opérations groupées, corbeille et migration locale des cookies, profils ou de l’espace de travail complet. Les icônes du Dock macOS et de la barre des tâches Windows peuvent afficher le numéro du profil.

## Vérification

Le projet utilise Pixelscan, CreepJS, BrowserLeaks, IPhey, la matrice d’empreintes Prism et l’audit des données de profils pour vérifier la cohérence des identités, la stabilité après redémarrage avec une même graine, la séparation entre graines, la cohérence iframe/Worker et la persistance des données.

Les tests tiers évoluent : aucune version ne garantit de tous les réussir indéfiniment. La qualité du proxy, la réputation IP, le bureau à distance, les polices et le matériel réel influencent également les résultats.

## Développement et compilation

Node.js 22 ou ultérieur, npm et les outils de compilation de votre plateforme sont requis. Depuis la racine du dépôt :

```bash
# Installer, vérifier et compiler
npm ci
npm run typecheck
npm run build

# Mode développement
npm run dev

# Paquet macOS
npm run dist:mac

# Paquet Windows
npm run dist:win
```

Ces commandes de création de paquets n’incluent pas le moteur d’empreintes. Pour compiler Chromium 144, prévoyez de préférence 32 Go de RAM, environ 300 Go libres sur SSD et un chemin court sans espaces.

- macOS arm64 : Xcode, Git, Python 3, Ninja et un volume APFS. Acceptez la licence Xcode, puis suivez le [guide de compilation](tools/macos-kernel/README.md).
- Windows x64 : Windows 10/11, Visual Studio avec développement Desktop en C++, Windows SDK, Git, Python 3 et un volume NTFS. Un environnement virtuel Python propre est conseillé. Consultez le [guide de compilation](tools/windows-kernel/README.md).

Les versions figées, commits amont, ordre des correctifs et SHA-256 sont dans `tools/kernel-lock.json` ; les correctifs communs se trouvent dans `tools/kernel-patches`. Relancez `Build-Kernel` pour reprendre une compilation interrompue. Les résultats sont placés dans `artifacts/<version>-<platform>` sous la racine de compilation, et les journaux dans `logs`. Les commandes détaillées figurent aussi dans le [README anglais](README.md).

Dans la gestion des moteurs de Prism, importez votre compilation : `Chromium.app` sur macOS, ou le répertoire contenant `chrome.exe` sur Windows. Vérifiez le moteur avant de l’activer ; les données et paramètres existants sont conservés.

## Sécurité et licence

Ne publiez pas de codes d’activation, mots de passe de proxy, cookies, informations de portefeuille, clés privées ou diagnostics contenant des données personnelles dans les issues. Fournissez des étapes minimales de reproduction, la version, la plateforme et l’impact, après retrait des informations sensibles. Une baisse de score d’empreinte n’est pas nécessairement une vulnérabilité ; précisez le site, la date, la version du moteur et les champs en échec.

Le code propre à Prism Browser Community est sous [licence MIT](LICENSE). Chromium, Electron et les autres composants conservent leurs licences respectives. Les distributions Chromium doivent inclure les fichiers `LICENSE`, `LICENSES` et mentions requis. La licence du code n’accorde pas automatiquement de droits sur les marques, le nom, le logo ou les icônes de Prism.

Utilisez ce projet uniquement pour l’isolation de navigateurs, les tests automatisés, la recherche sur la confidentialité et la gestion de comptes dans un cadre légal et autorisé, conformément aux conditions des sites et aux lois applicables.

## Historique des étoiles

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
