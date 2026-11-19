# MV Designer — Portfólio de Marcos Vital

Modelo de portfólio responsivo em português, em HTML, CSS e JavaScript. Não exige instalação nem compilação.

## Publicar no GitHub Pages

1. Abra **Settings → Pages** neste repositório.
2. Em **Build and deployment**, escolha **Deploy from a branch**.
3. Selecione **main** e a pasta **/ (root)**. Clique em **Save**.
4. Aguarde o GitHub mostrar o endereço publicado nessa mesma tela.

O nome deste repositório faz dele um site de projeto. Use o endereço mostrado pelo GitHub Pages; ele não é automaticamente um domínio próprio.

## Personalizar

- `index.html`: nome, apresentação, serviços e endereço de e-mail.
- `script.js`: número do WhatsApp e lista `projects` com títulos, categorias, imagens e descrições.
- `styles.css`: cores e layout. As cores principais ficam em `:root`.
- `assets/`: substitua ou adicione as imagens dos seus projetos.

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

Abra `index.html` no navegador ou rode `python3 -m http.server 8080` nesta pasta e acesse `http://localhost:8080`.
