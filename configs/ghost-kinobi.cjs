const path = require("path");
const k = require("@metaplex-foundation/kinobi");

// Paths.
const clientDir = path.join(__dirname, "..", "clients");
const idlDir = path.join(__dirname, "..", "idls");

// Instantiate Kinobi.
const kinobi = k.createFromIdls([
  path.join(idlDir, "bgl_ghost_program.json"),
]);

// Update programs.
kinobi.update(
  new k.updateProgramsVisitor({
    bglGhostProgram: { name: "bglGhost" },
  })
);

// Add PDAs.
kinobi.update(
  new k.updateAccountsVisitor({
  })
);

// Update instructions.
kinobi.update(
  new k.updateInstructionsVisitor({
  })
);

// Set ShankAccount discriminator.
const key = (name) => ({ field: "key", value: k.enumValueNode("Key", name) });
kinobi.update(
  new k.setAccountDiscriminatorFromFieldVisitor({
    myAccount: key("MyAccount"),
    myPdaAccount: key("MyPdaAccount"),
  })
);

// Render JavaScript.
const jsDir = path.join(clientDir, "js-ghost", "src", "generated");
const prettier = require(path.join(clientDir, "js-ghost", ".prettierrc.json"));
kinobi.accept(new k.renderJavaScriptVisitor(jsDir, { prettier }));

// Render Rust.
const crateDir = path.join(clientDir, "rust-ghost");
const rustDir = path.join(clientDir, "rust-ghost", "src", "generated");
kinobi.accept(
  new k.renderRustVisitor(rustDir, {
    formatCode: true,
    crateFolder: crateDir,
  })
);
