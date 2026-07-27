(function (window, document) {
    "use strict";

    const VALID_ROLES = [
        "owner",
        "manager",
        "staff"
    ];

    const RESTRICTED_SELECTOR =
        "[data-requires], [data-hide-for]";

    let activeContext = null;
    let permissionObserver = null;

    /**
     * Confirm that Firebase Authentication and Firestore
     * have been loaded by the current HTML page.
     */
    function ensureFirebaseAvailable() {
        if (
            typeof window.firebase === "undefined" ||
            typeof window.firebase.auth !== "function" ||
            typeof window.firebase.firestore !== "function"
        ) {
            throw new Error(
                "Firebase Authentication and Firestore must be loaded " +
                "before auth-permissions.js is used."
            );
        }
    }

    /**
     * Wait until Firebase has resolved the current login state.
     */
    function waitForAuthenticatedUser() {
        ensureFirebaseAvailable();

        return new Promise((resolve, reject) => {
            let unsubscribe = function () {};

            unsubscribe = window.firebase
                .auth()
                .onAuthStateChanged(
                    user => {
                        unsubscribe();

                        if (!user) {
                            reject(
                                new Error(
                                    "Authentication required."
                                )
                            );

                            return;
                        }

                        resolve(user);
                    },
                    error => {
                        unsubscribe();
                        reject(error);
                    }
                );
        });
    }

    /**
     * Sign the current user out safely.
     */
    async function safeSignOut() {
        try {
            ensureFirebaseAvailable();
            await window.firebase.auth().signOut();
        } catch (error) {
            console.error(
                "Unable to sign out:",
                error
            );
        }
    }

    /**
     * Read and validate users/{uid}.
     *
     * Manager and staff accounts must contain a hotelId.
     */
    async function getCurrentUserContext() {
        const user =
            await waitForAuthenticatedUser();

        const userDocument =
            await window.firebase
                .firestore()
                .collection("users")
                .doc(user.uid)
                .get();

        if (!userDocument.exists) {
            await safeSignOut();

            throw new Error(
                "Your user profile is missing. " +
                "Please contact an administrator."
            );
        }

        const profile =
            userDocument.data() || {};

        const role =
            String(profile.role || "")
                .trim()
                .toLowerCase();

        if (!VALID_ROLES.includes(role)) {
            await safeSignOut();

            throw new Error(
                "Your account does not have a valid role."
            );
        }

        if (
            (
                role === "manager" ||
                role === "staff"
            ) &&
            !profile.hotelId
        ) {
            await safeSignOut();

            throw new Error(
                "Your account does not have an assigned hotel."
            );
        }

        const context = {
            uid: user.uid,
            email: user.email || "",
            role,
            hotelId: profile.hotelId || null,
            name: profile.name || "",
            profile
        };

        activeContext = context;

        return context;
    }

    /**
     * Convert a comma-separated role attribute into an array.
     *
     * Examples:
     * data-requires="manager"
     * data-requires="manager,owner"
     * data-hide-for="staff"
     */
    function parseRoles(value) {
        return String(value || "")
            .split(",")
            .map(role => role.trim().toLowerCase())
            .filter(Boolean);
    }

    /**
     * Return every restricted element inside the supplied root.
     */
    function findRestrictedElements(root) {
        const elements = [];

        if (
            root &&
            root.nodeType === Node.ELEMENT_NODE &&
            root.matches(RESTRICTED_SELECTOR)
        ) {
            elements.push(root);
        }

        if (
            root &&
            typeof root.querySelectorAll === "function"
        ) {
            elements.push(
                ...root.querySelectorAll(
                    RESTRICTED_SELECTOR
                )
            );
        }

        return elements;
    }

    /**
     * Hide and disable controls that the current role cannot use.
     */
    function applyPermissions(
        context,
        root = document
    ) {
        if (!context || !context.role) {
            throw new Error(
                "A valid user context is required."
            );
        }

        const restrictedElements =
            findRestrictedElements(root);

        restrictedElements.forEach(element => {
            const requiredRoles =
                parseRoles(
                    element.getAttribute(
                        "data-requires"
                    )
                );

            const hiddenForRoles =
                parseRoles(
                    element.getAttribute(
                        "data-hide-for"
                    )
                );

            const failsRequiredRole =
                requiredRoles.length > 0 &&
                !requiredRoles.includes(
                    context.role
                );

            const explicitlyHidden =
                hiddenForRoles.includes(
                    context.role
                );

            const shouldHide =
                failsRequiredRole ||
                explicitlyHidden;

            if (!shouldHide) {
                return;
            }

            element.hidden = true;

            element.setAttribute(
                "aria-hidden",
                "true"
            );

            element.classList.add(
                "permission-hidden"
            );

            /*
             * Buttons, inputs and selects support disabled.
             */
            if ("disabled" in element) {
                element.disabled = true;
            }

            /*
             * Prevent links from receiving keyboard focus.
             */
            if (
                element.tagName === "A"
            ) {
                element.setAttribute(
                    "tabindex",
                    "-1"
                );
            }
        });
    }

    /**
     * Ensure hidden restricted elements cannot be made visible
     * by existing page CSS.
     */
    function addPermissionStyles() {
        if (
            document.getElementById(
                "business-auth-permission-styles"
            )
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id =
            "business-auth-permission-styles";

        style.textContent = `
            .permission-hidden,
            .permission-hidden[hidden] {
                display: none !important;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Apply restrictions to dynamically generated buttons and rows.
     */
    function observeDynamicControls(context) {
        if (permissionObserver) {
            permissionObserver.disconnect();
        }

        if (!document.body) {
            document.addEventListener(
                "DOMContentLoaded",
                () => observeDynamicControls(context),
                {
                    once: true
                }
            );

            return;
        }

        permissionObserver =
            new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (
                            node.nodeType !==
                            Node.ELEMENT_NODE
                        ) {
                            return;
                        }

                        applyPermissions(
                            context,
                            node
                        );
                    });
                });
            });

        permissionObserver.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );
    }

    /**
     * Determine the correct home page for a role.
     */
    function getRoleHomePage(role) {
        if (role === "owner") {
            return "owner-select-hotel.html";
        }

        return "manager-dashboard.html";
    }

    /**
     * Initialise authentication and permissions on a page.
     *
     * Manager page:
     * allowedRoles: ["manager", "staff"]
     *
     * Manager-only page:
     * allowedRoles: ["manager"]
     */
    async function initialisePage(options = {}) {
        const allowedRoles =
            Array.isArray(options.allowedRoles)
                ? options.allowedRoles.map(role =>
                    String(role).toLowerCase()
                )
                : [
                    "manager",
                    "staff"
                ];

        const context =
            await getCurrentUserContext();

        if (
            !allowedRoles.includes(
                context.role
            )
        ) {
            const redirectTarget =
                options.unauthorisedRedirect ||
                getRoleHomePage(
                    context.role
                );

            window.location.replace(
                redirectTarget
            );

            throw new Error(
                "You do not have permission to access this page."
            );
        }

        addPermissionStyles();
        applyPermissions(context);
        observeDynamicControls(context);

        /*
         * Pages can listen for this event when necessary.
         */
        document.dispatchEvent(
            new CustomEvent(
                "business-auth-ready",
                {
                    detail: context
                }
            )
        );

        return context;
    }

    /**
     * Return the assigned hotelId after initialisePage().
     */
    function getHotelId(context = activeContext) {
        if (!context || !context.hotelId) {
            throw new Error(
                "No assigned hotel is available."
            );
        }

        return context.hotelId;
    }

    /**
     * Add the authenticated user's hotelId to Firestore data.
     *
     * Example:
     * BusinessAuth.withHotelId({ name: "Room 1" })
     */
    function withHotelId(
        data,
        context = activeContext
    ) {
        return {
            ...data,
            hotelId: getHotelId(context)
        };
    }

    /**
     * Return the most recently initialised context.
     */
    function getActiveContext() {
        return activeContext;
    }

    window.BusinessAuth = {
        getCurrentUserContext,
        initialisePage,
        applyPermissions,
        getHotelId,
        withHotelId,
        getActiveContext,
        safeSignOut
    };
})(window, document);