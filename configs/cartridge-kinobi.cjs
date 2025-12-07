const path = require("path");
const k = require("@metaplex-foundation/kinobi");

// Paths.
const clientDir = path.join(__dirname, "..", "clients");
const idlDir = path.join(__dirname, "..", "idls");

// Instantiate Kinobi.
const kinobi = k.createFromIdls([
  path.join(idlDir, "bgl_cartridge_program.json"),
]);

// Update programs.
kinobi.update(
  new k.updateProgramsVisitor({
    bglCartridgeProgram: { name: "bglCartridge" },
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
        gameTokenAccount: {
          defaultValue: k.pdaValueNode(k.pdaLinkNode("associatedToken", "mplToolbox"), [
            k.pdaSeedValueNode("mint", k.publicKeyValueNode("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump")),
            k.pdaSeedValueNode("owner", k.accountValueNode("game")),
          ]),
        },
        paymentMint: {
          defaultValue: k.publicKeyValueNode("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump"),
        },
        associatedTokenProgram: {
          defaultValue: k.publicKeyValueNode("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        },
      },
      arguments: {
        nonce: {
          defaultValue: k.numberValueNode(0),
        },
      },
    },
    printGameCartridgeV1: {
      accounts: {
        gameTokenAccount: {
          defaultValue: k.pdaValueNode(
            k.pdaLinkNode("associatedToken", "mplToolbox"), [
              k.pdaSeedValueNode("mint", k.publicKeyValueNode("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump")),
              k.pdaSeedValueNode("owner", k.accountValueNode("game"))
            ]
          ),
        },
        payerTokenAccount: {
          defaultValue: k.pdaValueNode(
            k.pdaLinkNode("associatedToken", "mplToolbox"), [
              k.pdaSeedValueNode("mint", k.publicKeyValueNode("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump")),
              k.pdaSeedValueNode("owner", k.accountValueNode("payer"))
            ]
          ),
        },
        paymentMint: {
          defaultValue: k.publicKeyValueNode("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump"),
        },
      }
    },
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
const jsDir = path.join(clientDir, "js-cartridge", "src", "generated");
const prettier = require(path.join(clientDir, "js-cartridge", ".prettierrc.json"));
kinobi.accept(new k.renderJavaScriptVisitor(jsDir, {
  prettier, 
  dependencyMap: {
    mplToolbox: "@metaplex-foundation/mpl-toolbox",
  },
}));

// Render Rust.
const crateDir = path.join(clientDir, "rust-cartridge");
const rustDir = path.join(clientDir, "rust-cartridge", "src", "generated");
kinobi.accept(
  new k.renderRustVisitor(rustDir, {
    formatCode: true,
    crateFolder: crateDir,
  })
);
