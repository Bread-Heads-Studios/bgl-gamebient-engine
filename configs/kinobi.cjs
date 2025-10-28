const path = require("path");
const k = require("@metaplex-foundation/kinobi");

// Paths.
const clientDir = path.join(__dirname, "..", "clients");
const idlDir = path.join(__dirname, "..", "idls");

// Instantiate Kinobi.
const kinobi = k.createFromIdls([
  path.join(idlDir, "bgl_cartridge_program.json"),
  path.join(idlDir, "bgl_legit_program.json")
]);

// Update programs.
kinobi.update(
  new k.updateProgramsVisitor({
    bglCartridgeProgram: { name: "bglCartridge" },
    bglLegitProgram: { name: "bglLegit" },
  })
);

// Add PDAs.
kinobi.update(
  new k.updateAccountsVisitor({
    machine: {
      seeds: [
        k.constantPdaSeedNodeFromString("machine"),
        k.variablePdaSeedNode("machineCollection", k.publicKeyTypeNode(), "The address of the machine collection"),
        k.variablePdaSeedNode("name", k.stringTypeNode(), "The name of the machine"),
      ],
    },
    // TODO: Add PDA definitions for bgl-legit program
    // pool: { seeds: [constantPda("pool"), variablePda("authority")] },
    // stakeAccount: { seeds: [constantPda("stake"), variablePda("pool"), variablePda("staker")] },
    // vault: { seeds: [constantPda("vault"), variablePda("pool")] },
  })
);

// Update instructions.
kinobi.update(
  new k.updateInstructionsVisitor({
    commissionMachineV1: {
      accounts: {
        machine: {
          defaultValue: k.pdaValueNode(k.pdaLinkNode("machine", "hooked"), [
            k.pdaSeedValueNode("machineCollection", k.accountValueNode("machineCollection"), "The address of the machine collection"),
            k.pdaSeedValueNode("name", k.argumentValueNode("name"), "The name of the machine"),
          ]),
        },
      },
    },
    releaseGameV1: {
      accounts: {
        game: {
          defaultValue: k.pdaValueNode(k.pdaLinkNode("game", "hooked"), [
            k.pdaSeedValueNode("name", k.argumentValueNode("name"), "The name of the game"),
            k.pdaSeedValueNode("nonce", k.argumentValueNode("nonce"), "The nonce of the game"),
          ]),
        },
      },
      arguments: {
        nonce: {
          defaultValue: k.numberValueNode(0),
        },
      },
    },
    printGameCartridgeV1: {},
    insertCartridgeV1: {},
    removeCartridgeV1: {},
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
const jsDir = path.join(clientDir, "js", "src", "generated");
const prettier = require(path.join(clientDir, "js", ".prettierrc.json"));
kinobi.accept(new k.renderJavaScriptVisitor(jsDir, { prettier }));

// Render Rust.
const crateDir = path.join(clientDir, "rust");
const rustDir = path.join(clientDir, "rust", "src", "generated");
kinobi.accept(
  new k.renderRustVisitor(rustDir, {
    formatCode: true,
    crateFolder: crateDir,
  })
);
