const path = require("path");
const { generateIdl } = require("@metaplex-foundation/shank-js");

const idlDir = path.join(__dirname, "..", "idls");
const binaryInstallDir = path.join(__dirname, "..", ".crates");
const programDir = path.join(__dirname, "..", "programs");

// Helper to strip 'discriminator' fields from args types.
// shank-cli 0.4.2 includes #[skip] fields in the IDL but the old
// experimental build excluded them. We strip them to keep the IDL
// and generated clients consistent.
const stripSkippedFields = (idl) => {
  if (idl.types) {
    idl.types.forEach((t) => {
      if (t.type && t.type.fields) {
        t.type.fields = t.type.fields.filter(
          (f) => f.name !== "discriminator"
        );
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
  idlHook: stripSkippedFields,
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
  idlHook: stripSkippedFields,
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
  idlHook: stripSkippedFields,
});