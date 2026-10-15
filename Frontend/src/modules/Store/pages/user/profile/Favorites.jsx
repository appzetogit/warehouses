import { Link } from "react-router-dom"
import { useState } from "react"

import { Heart, Star, Clock, MapPin, ArrowRight, ArrowLeft, Bookmark } from "lucide-react"
import AnimatedPage from "@store/components/user/AnimatedPage"
import ScrollReveal from "@store/components/user/ScrollReveal"
import { useProfile } from "@store/context/ProfileContext"
import { storePathFor } from "@store/context/StoreModeContext"
import { toast } from "sonner"
import { imagePlaceholder } from "@store/constants/images"

/**
 * Wishlist on wide screens (phones get MobileWishlist), in the customer
 * app's look: cream page, white cards, brown actions.
 */

const PAGE = "min-h-screen bg-app-cream font-app text-app-ink dark:bg-[#0a0a0a]"
const CARD = "rounded-[18px] border border-app-line bg-white dark:border-gray-800 dark:bg-[#1a1a1a]"
const BROWN_BUTTON =
  "inline-flex items-center justify-center gap-1 rounded-xl bg-app-brown font-semibold text-white transition-colors hover:bg-app-brown-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown"
const REMOVE_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-app-brown shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-app-brown"

function BackLink() {
  return (
    <Link
      to="/user/profile"
      aria-label="Back to profile"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-ink hover:bg-app-tint-strong focus-visible:outline-2 focus-visible:outline-app-brown"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </Link>
  )
}

function EmptyBlock({ icon: Icon, text, cta }) {
  return (
    <div className={`col-span-full flex flex-col items-center px-6 py-14 text-center ${CARD}`}>
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-app-sand">
        <Icon className="h-8 w-8 text-app-brown" aria-hidden="true" />
      </span>
      <p className="mt-4 text-[16px] font-semibold text-app-ink dark:text-white">{text}</p>
      <Link to="/user" className={`${BROWN_BUTTON} mt-5 h-11 px-6 text-[14px]`}>
        {cta}
      </Link>
    </div>
  )
}

export default function Favorites() {
  const { getFavorites, removeFavorite, getDishFavorites, removeDishFavorite } = useProfile()
  const sellerFavorites = getFavorites()
  const dishFavorites = getDishFavorites()
  const [activeTab, setActiveTab] = useState("sellers")

  const handleRemoveFavorite = (e, slug) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm("Remove this seller from favorites?")) {
      removeFavorite(slug)
      toast.success("Seller removed from favorites")
    }
  }

  const handleRemoveDishFavorite = (e, dishId, sellerId) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm("Remove this item from favorites?")) {
      removeDishFavorite(dishId, sellerId)
      toast.success("Removed from your wishlist")
    }
  }

  const totalFavorites = sellerFavorites.length + dishFavorites.length

  if (totalFavorites === 0) {
    return (
      <AnimatedPage className={`${PAGE} p-4 lg:px-8 lg:py-8`}>
        <div className="mx-auto max-w-4xl space-y-6">
          <ScrollReveal>
            <div className="flex items-center gap-3">
              <BackLink />
              <h1 className="font-app-display text-[34px] font-bold leading-tight text-app-brown-deep dark:text-white">My Favorites</h1>
            </div>
          </ScrollReveal>
          <EmptyBlock icon={Heart} text="You haven't added any favorites yet" cta="Explore Sellers" />
        </div>
      </AnimatedPage>
    )
  }

  const tabClass = (on) =>
    `rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brown ${
      on ? "bg-app-brown text-white" : "bg-app-sand text-app-brown-deep hover:bg-app-tint-strong"
    }`

  return (
    <AnimatedPage className={`${PAGE} p-4 lg:px-8 lg:py-8`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <ScrollReveal>
          <div className="flex items-center gap-3">
            <BackLink />
            <div>
              <h1 className="font-app-display text-[34px] font-bold leading-tight text-app-brown-deep dark:text-white">My Favorites</h1>
              <p className="mt-0.5 text-[13px] font-medium text-app-muted">
                {dishFavorites.length || 0} {dishFavorites.length === 1 ? "dish" : "dishes"} • {sellerFavorites.length || 0} {sellerFavorites.length === 1 ? "seller" : "sellers"}
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Favorites">
          <button type="button" role="tab" aria-selected={activeTab === "sellers"} onClick={() => setActiveTab("sellers")} className={tabClass(activeTab === "sellers")}>
            Sellers ({sellerFavorites.length})
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "dishes"} onClick={() => setActiveTab("dishes")} className={tabClass(activeTab === "dishes")}>
            Dishes ({dishFavorites.length})
          </button>
        </div>

        {/* Sellers Tab */}
        {activeTab === "sellers" && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sellerFavorites.length === 0 ? (
              <EmptyBlock icon={Heart} text="No sellers saved yet" cta="Explore Sellers" />
            ) : (
              sellerFavorites.map((seller, index) => (
                <ScrollReveal key={seller.slug} delay={index * 0.1}>
                  <Link to={`/user/sellers/${seller.slug}`} className={`group block h-full overflow-hidden ${CARD} transition-shadow hover:shadow-[0_6px_18px_rgba(25,20,17,0.08)]`}>
                    <div className="relative h-32 w-full overflow-hidden bg-app-alt">
                      <img
                        src={seller.image}
                        alt={seller.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.target.src = imagePlaceholder
                        }}
                      />
                      <div className="absolute right-2 top-2">
                        <button
                          type="button"
                          aria-label={`Remove ${seller.name} from favorites`}
                          className={REMOVE_BUTTON}
                          onClick={(e) => handleRemoveFavorite(e, seller.slug)}
                        >
                          <Heart className="h-4 w-4 fill-app-brown" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5">
                        <Star className="h-3 w-3 fill-app-ok text-app-ok" aria-hidden="true" />
                        <span className="text-[11px] font-bold text-app-ink">{seller.rating}</span>
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-1 text-[14px] font-bold text-app-ink dark:text-white">{seller.name}</p>
                      <div className="flex items-center justify-between border-t border-app-line pt-2 text-[11.5px] text-app-muted dark:border-gray-800">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span className="font-medium">{seller.deliveryTime}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          <span className="font-medium">{seller.distance}</span>
                        </span>
                      </div>
                      <span className={`${BROWN_BUTTON} h-8 w-full text-[12px]`}>
                        View Seller
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </ScrollReveal>
              ))
            )}
          </div>
        )}

        {/* Dishes Tab */}
        {activeTab === "dishes" && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {dishFavorites.length === 0 ? (
              <EmptyBlock icon={Bookmark} text="No items saved yet" cta="Explore Dishes" />
            ) : (
              dishFavorites.map((dish, index) => {
                // Saved from the Quick store or the shop; open the product in that store.
                const productPath = storePathFor(dish.mode === "quick" ? "quick" : "shop", `/product/${encodeURIComponent(String(dish.id))}`)
                return (
                  <ScrollReveal key={`${dish.id}-${dish.sellerId}`} delay={index * 0.1}>
                    <Link to={productPath} className={`group block h-full overflow-hidden ${CARD} transition-shadow hover:shadow-[0_6px_18px_rgba(25,20,17,0.08)]`}>
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-app-alt">
                        <img
                          src={dish.image || imagePlaceholder}
                          alt={dish.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = imagePlaceholder
                          }}
                        />
                        <div className="absolute right-2 top-2">
                          <button
                            type="button"
                            aria-label={`Remove ${dish.name} from favorites`}
                            className={REMOVE_BUTTON}
                            onClick={(e) => handleRemoveDishFavorite(e, dish.id, dish.sellerId)}
                          >
                            <Heart className="h-4 w-4 fill-app-brown" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 p-3">
                        <div>
                          <p className="line-clamp-1 text-[14px] font-semibold text-app-ink dark:text-white">{dish.name}</p>
                          <p className="line-clamp-1 text-[12px] text-app-muted">{dish.sellerName || "Seller"}</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-app-line pt-2 dark:border-gray-800">
                          <div className="flex items-center gap-1">
                            {dish.foodType === "Veg" ? (
                              <div className="flex h-3 w-3 items-center justify-center rounded-sm border-2 border-green-600">
                                <div className="h-1.5 w-1.5 rounded-full bg-green-600"></div>
                              </div>
                            ) : dish.foodType === "Non-Veg" ? (
                              <div className="flex h-3 w-3 items-center justify-center rounded-sm border-2 border-[#B3261E]">
                                <div className="h-1.5 w-1.5 rounded-full bg-[#B3261E]"></div>
                              </div>
                            ) : null}
                            {(dish.foodType === "Veg" || dish.foodType === "Non-Veg") && (
                              <span className="text-[11.5px] font-medium text-app-muted">{dish.foodType}</span>
                            )}
                          </div>
                          <div className="text-[15px] font-extrabold text-app-ink dark:text-white">
                            {"₹"}{Math.round(dish.price || 0)}
                          </div>
                        </div>
                        <span className={`${BROWN_BUTTON} h-8 w-full text-[12px]`}>
                          View Dish
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </ScrollReveal>
                )
              })
            )}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
