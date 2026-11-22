/** A provider button of `idg-sign-in`. */
export interface SignInProvider {
  /** The provider's name in the CMS, such as `github`. */
  readonly name: string;
  /** What the button calls it, such as `GitHub`. */
  readonly label: string;
}

/** Detail of `idgProviderSignIn`. */
export interface ProviderSignInDetail {
  readonly provider: string;
  /** The CMS URL the client built, which starts the provider's sign-in. */
  readonly url: string;
}
