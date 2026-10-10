# Prism Browser Community

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | **[Português (Brasil)](README.pt-BR.md)**

[Français](README.fr.md) | [Українська](README.uk.md) | [Español](README.es.md) | [Türkçe](README.tr.md) | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

Autor: [DFarm](https://x.com/DFarm_club) · Site oficial: [prismbrowser.app](https://prismbrowser.app/)

O Prism Browser gerencia perfis locais de navegador com impressões digitais, usando um Chromium personalizado. Cada perfil tem cookies, cache, dados de extensões, proxy e configuração de impressão digital independentes, permitindo várias identidades de navegação isoladas.

Por padrão, os perfis, cookies, credenciais de proxy e histórico ficam no dispositivo do usuário. A edição Community é gratuita e não limita a quantidade de perfis locais.

## Manutenção do código-fonte

Este repositório continuará público para estudo, revisão e compilações da comunidade. Desde a versão `v0.3.17`, novidades, correções e mudanças no código do produto deixaram de ser sincronizadas regularmente aqui. A complexidade do aplicativo, dos motores, dos pacotes multiplataforma e dos recursos Pro aumentou o custo de manter e testar várias branches.

Como exceção, esta atualização traz a localização geral da versão 0.3.19 e traduz a interface pública existente. Não inclui runtimes privados do Pro, serviços de licenciamento, novos recursos Pro ou configurações privadas de publicação. Isso não retoma a sincronização contínua do código do produto.

O código existente, o histórico de commits e as versões anteriores serão mantidos. Consulte o [site oficial](https://prismbrowser.app/) e as [Releases](../../releases) para novidades, correções e instaladores.

## Idiomas

A interface e o README estão disponíveis em **13 idiomas**: chinês simplificado e tradicional, inglês, russo, vietnamita, tailandês, português do Brasil, francês, ucraniano, espanhol, turco, japonês e hindi. Use os links no topo para trocar o idioma do README.

- A inicialização acompanha o idioma principal de exibição do sistema; inglês é usado quando ele não está disponível ou não é compatível.
- O seletor no canto superior direito troca o idioma imediatamente. A escolha manual fica salva localmente e tem prioridade nas próximas inicializações.
- O idioma da interface é independente do idioma e do fuso horário da impressão digital. Nomes, notas, etiquetas e alterações não salvas são preservados.
- As traduções estão incluídas no aplicativo, sem serviço de tradução online. Veja o [guia de localização em chinês e inglês](docs/localization.md) para contribuir.

## Download e primeiros passos

Baixe o pacote adequado em [Releases](../../releases): DMG ou ZIP para macOS; instalador ou versão Portable para Windows. Os pacotes publicados incluem o motor de impressão digital Chromium 144 pronto para uso, sem precisar compilar Chromium.

Se o sistema bloquear uma versão sem assinatura, confirme a abertura em **Ajustes do Sistema → Privacidade e Segurança** no macOS, ou em **Mais informações → Executar assim mesmo** no SmartScreen do Windows. Baixe apenas das Releases deste projeto e confira o SHA-256 publicado.

1. Abra o Prism Browser e crie um perfil.
2. Informe o nome e escolha sistema, idioma, fuso horário, tela e identidade de hardware.
3. Use conexão direta quando não precisar de proxy. Caso contrário, informe protocolo, host, porta e credenciais e teste a conexão.
4. Salve e abra o perfil. Ao fechar a janela, cookies, cache, favoritos e dados de extensões permanecem salvos.

Cada perfil usa um diretório de dados próprio. A duplicação mantém as configurações e gera uma identidade e uma semente novas.

## Recursos

Tudo roda na máquina local: não há conta, assinatura nem ativação. A API de automação local, as tarefas agendadas e o controle de IA local via MCP fazem parte da versão gratuita, e o núcleo de impressões digitais acompanha o aplicativo.

Community oferece perfis locais ilimitados, dados independentes, proxies HTTP/HTTPS/SOCKS5 e proteção contra vazamentos WebRTC. É possível configurar User-Agent, idioma, fuso horário, tela, CPU, memória e GPU, mantendo consistência entre Canvas, WebGL, Audio, DOMRect, fontes, Speech e WebGPU.

Também inclui duplicação, grupos, etiquetas, favoritos, operações em lote, lixeira e migração local de cookies, perfis ou de todo o espaço de trabalho. Os ícones no Dock do macOS e na barra de tarefas do Windows podem mostrar o número do perfil.

## Verificação

O projeto usa Pixelscan, CreepJS, BrowserLeaks, IPhey, a matriz de impressões digitais Prism e a auditoria de dados de perfis. São verificadas a consistência de identidade, a estabilidade após reiniciar com a mesma semente, a separação entre sementes, a consistência entre iframe/Worker e a persistência de dados.

Testes de terceiros mudam; não há garantia de passar em todos indefinidamente. Qualidade do proxy, reputação do IP, acesso remoto, fontes do sistema e hardware real também afetam os resultados.

## Desenvolvimento e compilação

Você precisa de Node.js 22 ou posterior, npm e das ferramentas de compilação da plataforma. Na raiz do repositório:

```bash
# Instalar, verificar e compilar
npm ci
npm run typecheck
npm run build

# Modo de desenvolvimento
npm run dev

# Pacote para macOS
npm run dist:mac

# Pacote para Windows
npm run dist:win
```

Esses comandos de empacotamento não incluem o motor de impressão digital. Para compilar Chromium 144, recomenda-se 32 GB de RAM, cerca de 300 GB livres em SSD e um caminho curto sem espaços.

- macOS arm64: Xcode, Git, Python 3, Ninja e volume APFS. Aceite a licença do Xcode e siga o [guia de compilação](tools/macos-kernel/README.md).
- Windows x64: Windows 10/11, Visual Studio com desenvolvimento para desktop em C++, Windows SDK, Git, Python 3 e volume NTFS. Recomenda-se um ambiente virtual Python limpo. Consulte o [guia de compilação](tools/windows-kernel/README.md).

Versões fixadas, commits de origem, ordem dos patches e SHA-256 estão em `tools/kernel-lock.json`; patches compartilhados ficam em `tools/kernel-patches`. Execute `Build-Kernel` novamente para retomar uma compilação interrompida. Os resultados ficam em `artifacts/<version>-<platform>` dentro da raiz de compilação e os logs em `logs`. Os comandos detalhados também estão no [README em inglês](README.md).

Na gestão de motores do Prism, importe a compilação local: `Chromium.app` no macOS ou o diretório com `chrome.exe` no Windows. Verifique o motor antes de ativá-lo; os dados e ajustes existentes são mantidos.

## Segurança e licença

Não publique códigos de ativação, senhas de proxy, cookies, informações de carteiras, chaves privadas ou diagnósticos com dados pessoais em issues. Forneça passos mínimos para reprodução, versão, plataforma e impacto, removendo dados sensíveis. Mudanças em pontuações de testes de impressão digital não são necessariamente vulnerabilidades; informe site, data, versão do motor e campos que falharam.

O código próprio do Prism Browser Community usa a [licença MIT](LICENSE). Chromium, Electron e outros componentes mantêm suas respectivas licenças. Distribuições Chromium devem preservar os arquivos `LICENSE`, `LICENSES` e avisos obrigatórios. A licença do código não concede automaticamente direitos de marca sobre o nome, logotipo ou ícones do Prism.

Use o projeto apenas para isolamento de navegadores, testes automatizados, pesquisa de privacidade e gestão de contas de forma legal e autorizada, respeitando os termos dos sites e as leis aplicáveis.

## Histórico de estrelas

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
