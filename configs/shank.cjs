const path = require("path");
const { generateIdl } = require("@metaplex-foundation/shank-js");

const idlDir = path.join(__dirname, "..", "idls");
const binaryInstallDir = path.join(__dirname, "..", ".crates");
const programDir = path.join(__dirname, "..", "programs");

// Workarounds for shank-cli 0.4.2 IDL generation differences:
// 1. Strip 'discriminator' fields marked with #[skip] (0.4.2 includes them, old build excluded them)
// 2. Apply #[idl_type] overrides (0.4.2 records the attr but doesn't change the type)
const fixIdl = (typeOverrides) => (idl) => {
  if (idl.types) {
    idl.types.forEach((t) => {
      if (t.type && t.type.fields) {
        // Strip #[skip] discriminator fields
        t.type.fields = t.type.fields.filter(
          (f) => f.name !== "discriminator"
        );

        // Apply #[idl_type] overrides
        const overrides = typeOverrides[t.name];
        if (overrides) {
          t.type.fields.forEach((f) => {
            if (overrides[f.name]) {
              f.type = overrides[f.name];
              f.attrs = ["idl-type"];
            }
          });
        }
      }
    });
  }
  return idl;
};

// Generate IDL for bgl-cartridge program
generateIdl({
  generator: "shank",
  programName: "bgl_cartridge_program",
  programId: "CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo",
  idlDir,
  idlName: "bgl_cartridge_program",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-cartridge"),
  rustbin: { locked: true },
  idlHook: fixIdl({
    GameCollectionData: {
      priceType: { defined: "PriceType" },
    },
    CartridgeData: {
      source: { defined: "Source" },
    },
    SetCartridgeSourceV1Args: {
      source: { defined: "Source" },
    },
  }),
});

// Generate IDL for bgl-legit program
generateIdl({
  generator: "shank",
  programName: "bgl_legit_program",
  programId: "LEG1T5rABhAnNFz62E4x2dSMjfsuDQyfc5sZjJi9tCq",
  idlDir,
  idlName: "bgl_legit_program",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-legit"),
  rustbin: { locked: true },
  idlHook: fixIdl({
    StakingConfig: {
      lockupPeriod: "i64",
    },
  }),
});

// Generate IDL for bgl-ghost program
generateIdl({
  generator: "shank",
  programName: "bgl_ghost_program",
  programId: "GHoSTpSurgVaWBYJXnDZgiMMdKsWxjWmCvtVqE23JiS3",
  idlDir,
  idlName: "bgl_ghost_program",
  binaryInstallDir,
  programDir: path.join(programDir, "bgl-ghost"),
  rustbin: { locked: true },
  idlHook: fixIdl({}),
});
