# MV Designer — Portfólio de Marcos Vital

Modelo de portfólio responsivo em português, em HTML, CSS e JavaScript. Não exige instalação nem compilação.

## Publicar no GitHub Pages

1. Abra **Settings → Pages** neste repositório.
2. Em **Build and deployment**, escolha **Deploy from a branch**.
3. Selecione **main** e a pasta **/ (root)**. Clique em **Save**.
4. Aguarde o GitHub mostrar o endereço publicado nessa mesma tela.

## Domínio próprio: mvcatalogo.com.br

| Endereço | O que abre |
| --- | --- |
| `https://mvcatalogo.com.br` | Login do catálogo (a raiz redireciona para `catalogo/`) |
| `https://mvcatalogo.com.br/catalogo/loja.html?loja=endereco` | Catálogo público de cada loja |
| `https://mvcatalogo.com.br/portfolio/` | Portfólio MV Designer |

- O domínio está cadastrado em **Settings → Pages → Custom domain** (o GitHub guarda isso no arquivo `CNAME`; não apague esse arquivo).
- DNS no Registro.br (modo avançado): registros `A` para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`, registros `AAAA` para `2606:50c0:8000::153` a `2606:50c0:8003::153` e `www` como `CNAME` para `vdvital.github.io`.
- Os endereços antigos `vdvital.github.io/-MVDesigner.github.io/...` passam a redirecionar para o domínio novo.
- No Firebase (**Authentication → Configurações → Domínios autorizados**) e na chave da API do Google, o domínio `mvcatalogo.com.br` também precisa estar autorizado.

## Personalizar o portfólio

Os arquivos do portfólio ficam na pasta `portfolio/`:

- `portfolio/index.html`: nome, apresentação, serviços e endereço de e-mail.
- `portfolio/script.js`: número do WhatsApp e lista `projects` com títulos, categorias, imagens e descrições.
- `portfolio/styles.css`: cores e layout. As cores principais ficam em `:root`.
- `portfolio/assets/`: substitua ou adicione as imagens dos seus projetos.

**Contato reutilizado do portfólio existente:** WhatsApp (11) 99397-5886 e marcos.vital2008@outlook.com. Confira se permanecem atuais.

Os projetos Nexo e Alva são **estudos conceituais**, reaproveitados do repositório MVdesigner, e estão identificados no site. Os demais cartões apresentam áreas de atuação, sem inventar resultados ou clientes. Para mostrar trabalhos reais, edite a lista `projects` e insira imagens próprias, com autorização de uso.

## Funcionalidades

- Navegação por seções e layout para celular, tablet e computador.
- Filtros de portfólio e detalhes em janela acessível.
- Formulário que prepara uma mensagem para WhatsApp; o visitante confirma o envio no WhatsApp. Não há servidor de formulário ou armazenamento de dados.
- Respeita a preferência de movimento reduzido e oferece navegação por teclado.

## Catálogo online

A pasta `catalogo/` tem um sistema de catálogos com painel de administrador, controle de tempo de acesso, importação do Excel e fotos do Google Drive. Veja `catalogo/LEIA-ME.md`.

## Prévia local

Rode `python3 -m http.server 8080` nesta pasta e acesse `http://localhost:8080` (catálogo) ou `http://localhost:8080/portfolio/` (portfólio).
